const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { randomUUID } = require('node:crypto');
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  Notification,
  shell,
  nativeImage,
  dialog,
  clipboard,
} = require('electron');
const updater = require('./updater');
const store = require('./store');
const i18n = require('./i18n');
const { translateBatch } = require('./translate');
// 로컬 치지직 폴링(Poller)은 더 이상 쓰지 않는다 — 알림·브라우저 자동 열기·멤버/스케줄은
//  모두 스텔라리움 계정/웹 데이터에서만 온다. require 자체를 제거해 로컬 네트워크 호출을 끊는다.
const discord = require('./discord');

// 표시/업데이트용 버전. package.json 의 version 은 빌드 도구(electron-builder) 요구로 3자리 semver 여야 하므로,
// 베타의 4자리 표기(예: 1.0.5.1)는 fullVersion 에 두고 앱 전반에서 이 값을 쓴다.
let PKG_FULL_VERSION = '';
try { PKG_FULL_VERSION = require('../../package.json').fullVersion || ''; } catch { /* ignore */ }
function appVersion() { return PKG_FULL_VERSION || app.getVersion(); }

const APP_ID = 'com.stellastatus.app';
const ICON_PATH = path.join(app.getAppPath(), 'build', 'icon.png');
const isDev = process.argv.includes('--dev') || !app.isPackaged;

// web(스텔라리움) 기준 주소 — 개발은 로컬 web 서버, 배포는 stellarium.kr.
const webBase = () => process.env.STELLA_WEB_BASE || (isDev ? 'http://localhost:3000' : 'https://stellarium.kr');

// 이 URL 을 앱 webview 안에서 계속 열어야 하는가. 그 외(유튜브·치지직·외부 사이트 등)는 기본 브라우저로 연다.
//  - 스텔라리움 자신(stellarium.kr / localhost)은 당연히 안에서.
//  - 로그인(OAuth) 흐름은 webview 안에서 끝나야 콜백이 돌아오므로 구글/네이버 로그인 호스트도 허용한다.
function keepInApp(url) {
  let h;
  try { h = new URL(url).hostname.toLowerCase(); } catch { return true; } // 상대/비정상 URL 은 그냥 둔다
  const allow = ['stellarium.kr', 'localhost', '127.0.0.1', 'accounts.google.com', 'nid.naver.com'];
  return allow.some((a) => h === a || h.endsWith('.' + a));
}

// 외부 열기 보안 가드 — shell.openExternal 은 OS 에 등록된 스킴 핸들러(file:, 커스텀 앱 스킴 등)를
//  실행할 수 있어 신뢰할 수 없는 URL(웹/치지직 데이터)에서 오면 위험하다. http(s)·mailto 만 연다.
function safeOpenExternal(url) {
  if (typeof url !== 'string' || !url) return;
  let proto;
  try { proto = new URL(url).protocol; } catch { return; }
  if (proto === 'http:' || proto === 'https:' || proto === 'mailto:') shell.openExternal(url);
}

// 설정 변경 허용 키 — 브리지(stellarium.kr)로 들어오는 setSettings 가 임의 키나 프로토타입 오염
//  (__proto__ 등)을 config 에 쓰지 못하도록, 알려진 설정만 통과시킨다.
const ALLOWED_SETTINGS = new Set([
  'language', 'pollIntervalSec', 'notifyEnabled', 'notifyOffline', 'autoOpenLive', 'autoOpenList',
  'subscribed', 'minimizeToTray', 'launchAtStartup', 'startHidden', 'betaChannel', 'showThumbnails',
  'pinned', 'windowBounds', 'lastShownVersion', 'viewMode', 'discordRpc',
]);
function sanitizeSettingsPatch(patch) {
  const clean = {};
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    for (const k of Object.keys(patch)) if (ALLOWED_SETTINGS.has(k)) clean[k] = patch[k];
  }
  return clean;
}

// 디스코드 Rich Presence 문구 — 지금 보고 있는 스텔라리움 webview 의 URL·제목으로 '무엇을 보는 중'인지 만든다.
// 영상 페이지면 유튜브 videoId 를 뽑는다. /video/<id>, /videos/<id>, /watch?v=<id> 지원.
function videoIdFrom(url, p) {
  const m = /^\/videos?\/([^/?#]+)/.exec(p);
  if (m) return decodeURIComponent(m[1]);
  try { const v = new URL(url).searchParams.get('v'); if (v) return v; } catch { /* ignore */ }
  return null;
}

function presenceFor(url, title) {
  let p = '/';
  try { p = new URL(url).pathname; } catch { /* about:blank 등 */ }
  const t = (title || '스텔라리움').trim() || '스텔라리움';
  if (/^\/stella\//.test(p)) return { details: t, state: '스텔라 보는 중' };
  if (/^\/(videos?|watch)\b/.test(p)) {
    const act = { details: t, state: '영상 보는 중' };
    const id = videoIdFrom(url, p);
    if (id) {
      // 큰 이미지 = 영상 썸네일, 오른쪽 하단 작은 아이콘 = 로고, 그리고 '영상 바로가기' 버튼.
      act.largeImageKey = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      act.largeImageText = t;
      act.smallImageKey = 'logo';
      act.smallImageText = '스텔라리움';
      act.buttons = [{ label: '영상 바로가기', url: `https://stellarium.kr/video/${id}` }];
    }
    return act;
  }
  if (/^\/album/.test(p)) return { details: t, state: '앨범 보는 중' };
  if (/^\/playlist/.test(p)) return { details: t, state: '플레이리스트 보는 중' };
  if (/^\/event/.test(p)) return { details: t, state: '이벤트 보는 중' };
  if (/^\/calendar/.test(p)) return { details: '캘린더', state: '일정 보는 중' };
  if (/^\/setting/.test(p)) return { details: '설정', state: '스텔라리움' };
  if (p === '/' || p === '') return { details: '스텔라리움 홈', state: '둘러보는 중' };
  return { details: t, state: '둘러보는 중' };
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

// 윈도우 알림에 앱 이름이 제대로 표시되도록 AppUserModelID 설정
app.setAppUserModelId(APP_ID);

// GPU 셰이더 디스크 캐시가 잠겨(백신 실시간 검사/중복 실행 등) 이동에 실패하면
// "Unable to move the cache (0x5)" / "Gpu Cache Creation failed" 로그가 뜬다(동작엔 무해).
// 디스크 캐시를 쓰지 않게 해 해당 로그를 없앤다.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

// 안정성: 예기치 못한 오류로 앱이 강제 종료/오류창이 뜨지 않도록 로깅 후 계속 실행
process.on('uncaughtException', (err) => console.error('메인 예외:', err));
process.on('unhandledRejection', (reason) => console.error('메인 거부:', reason));

// 단일 인스턴스 보장 — 두 번째 실행 시 기존 창을 띄운다.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

// ── 창 ────────────────────────────────────────────────────
function createWindow() {
  const bounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 940,
    minHeight: 640,
    show: false,
    // macOS: 네이티브 신호등 버튼(좌측 상단)을 쓰되 타이틀바는 숨겨 콘텐츠를 위로 끌어올린다.
    //        (trafficLightPosition 으로 커스텀 타이틀바 높이(--tb-h:44px) 중앙에 맞춘다.)
    // Windows/기타: 프레임을 없애고 우측 커스텀 버튼(min/max/close)을 사용한다.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 9 } }
      : { frame: false }),
    backgroundColor: '#0b0a1a',
    icon: ICON_PATH,
    title: '스텔라리움',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 캘린더는 web(stellarium.kr/calendar)을 <webview> 로 임베드해 쓴다.
      webviewTag: true,
    },
  });

  // 임베드 webview(스텔라리움·캘린더·설문)에 브리지 preload 를 주입한다.
  //  웹이 window.stellaApp 로 앱 네이티브 설정을 읽고 쓸 수 있게 한다(노출은 우리 도메인에서만).
  mainWindow.webContents.on('will-attach-webview', (_e, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    // 부팅 자동 실행(--hidden) 또는 startHidden 설정이면 창을 띄우지 않고 트레이에만 상주
    const startHidden = process.argv.includes('--hidden') || store.get('startHidden');
    if (!startHidden) showWindow();
  });

  // 창 크기/위치 저장
  const saveBounds = () => {
    if (mainWindow && !mainWindow.isMinimized() && !mainWindow.isMaximized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // 닫기 → 트레이로 최소화(설정에 따라)
  mainWindow.on('close', (e) => {
    if (!isQuitting && store.get('minimizeToTray')) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function showWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ── 트레이 ────────────────────────────────────────────────
function createTray() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('스텔라리움');
  rebuildTrayMenu();
  tray.on('double-click', () => showWindow());
  tray.on('click', () => showWindow());
}

function rebuildTrayMenu() {
  if (!tray) return;
  // 로컬 방송 감지를 쓰지 않으므로 트레이는 단순하게 — 창 열기/설정/업데이트/종료만.
  const menu = Menu.buildFromTemplate([
    { label: '스텔라리움', enabled: false },
    { type: 'separator' },
    { label: i18n.t('tray.open'), click: () => showWindow() },
    { label: i18n.t('tray.settings'), click: () => { showWindow(); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open:settings'); } },
    { label: i18n.t('tray.checkUpdate'), click: () => { showWindow(); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:check-manual'); } },
    { type: 'separator' },
    { label: i18n.t('tray.quit'), click: () => quitApp() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('스텔라리움');
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

// ── 알림 ──────────────────────────────────────────────────
// 알림의 유일한 소스는 웹(로그인된 계정 inbox → AppNotifyMirror → notify:fromWeb)이다.
//  로컬 치지직 폴링이 제거돼 중복 걱정이 없으므로, mirror:active 는 단순 ack 만 한다.
// 웹에서 넘어온 알림 중복 제거 — 여러 webview(홈/캘린더/설문)가 동시에 넘겨도 id 로 1회만 표시.
const shownWebNotif = new Map(); // id -> ts(ms)

// 같은 오리진 상대경로(/go/live/.. 등)를 절대 URL 로. 웹 base 는 webBase().
function absUrl(u) {
  if (!u || typeof u !== 'string') return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return webBase().replace(/\/$/, '') + u;
  return null;
}
// 알림 아이콘은 nativeImage 로 만들어 캐시한다.
//  - 패키징(asar) 후 ICON_PATH 는 '...app.asar/build/icon.png' 처럼 asar 내부 경로가 된다.
//    이 문자열 경로를 그대로 icon 에 넘기면 macOS 의 네이티브 이미지 로더가 asar 를 읽지 못해
//    아이콘 로딩이 실패하고, 그 여파로 시스템 알림 자체가 표시되지 않는 경우가 있다.
//    nativeImage.createFromPath 는 Electron 의 파일 접근을 쓰므로 asar 경로도 정상적으로 읽는다.
//  - 이미지가 비어 있으면(경로 문제 등) 아예 아이콘을 넘기지 않는다(macOS 는 앱 아이콘으로 대체).
let _notifyIcon;
function notifyIcon() {
  if (_notifyIcon === undefined) {
    try {
      const img = nativeImage.createFromPath(ICON_PATH);
      _notifyIcon = img && !img.isEmpty() ? img : null;
    } catch { _notifyIcon = null; }
  }
  return _notifyIcon || undefined;
}

// ── 자동 업데이트 ─────────────────────────────────────────
let lastNotifiedUpdate = null;

function notifyUpdate(info) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: i18n.t('notify.updTitle', { v: info.version }),
    body: info.mandatory ? i18n.t('notify.updBodyReq') : i18n.t('notify.updBody'),
    icon: notifyIcon(),
    silent: false,
  });
  n.on('click', () => showWindow());
  n.on('failed', (_e, err) => console.error('알림 표시 실패(update):', err));
  n.show();
}

function setupAutoUpdater() {
  updater.init((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', payload);
    // 업데이트가 감지되면 윈도우 알림(버전당 1회)
    if (payload.state === 'available' && payload.version && payload.version !== lastNotifiedUpdate) {
      lastNotifiedUpdate = payload.version;
      notifyUpdate(payload);
    }
    // 필수(강제) 업데이트는 트레이에 숨어 있어도 창을 띄워 안내가 반드시 보이도록 한다.
    if (payload.state === 'available' && payload.mandatory) showWindow();
  });

  if (!isDev) {
    updater.check({ manual: false });
    setInterval(() => updater.check({ manual: false }), 6 * 60 * 60 * 1000);
  }
}

// ── 자동 실행(로그인 시) ──────────────────────────────────
function applyLaunchAtStartup(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ['--hidden'],
  });
}

// ── IPC ───────────────────────────────────────────────────
function registerIpc() {
  // 멤버 로스터는 웹(스텔라리움 계정)에서 관리한다 — 앱은 로컬 치지직 로스터를 더 이상 들고 있지 않는다.
  ipcMain.handle('members:get', () => []);
  ipcMain.handle('members:refresh', () => []);

  ipcMain.handle('settings:get', () => store.store);
  ipcMain.handle('settings:set', (_e, rawPatch) => {
    const before = store.store;
    const patch = sanitizeSettingsPatch(rawPatch); // 허용 키만(프로토타입 오염·임의 키 방지)
    store.set(patch);
    if ('launchAtStartup' in patch && patch.launchAtStartup !== before.launchAtStartup) {
      applyLaunchAtStartup(patch.launchAtStartup);
    }
    if ('discordRpc' in patch && patch.discordRpc !== before.discordRpc) {
      discord.setEnabled(patch.discordRpc);
    }
    // 언어가 바뀌면 트레이 메뉴/툴팁을 새 언어로 다시 그린다(알림은 표시 시점에 현재 언어 사용).
    if ('language' in patch && patch.language !== before.language) {
      rebuildTrayMenu();
    }
    return store.store;
  });

  // ── 웹↔앱 알림 미러링 ──────────────────────────────────────
  // 앱 webview(stellarium.kr)가 로그인된 계정의 새 알림을 넘겨주면 네이티브 토스트로 띄운다.
  //  구독(어떤 스텔라의 live/X/유튜브)은 웹 계정에서 관리하고, 앱은 '표시'와 '브라우저 자동 열기'만 한다.
  //  mirror:active 는 호환을 위해 남겨둔 ack(로컬 폴링이 없어 더 끌 것이 없다).
  ipcMain.handle('mirror:active', () => true);
  ipcMain.handle('notify:fromWeb', (_e, item) => {
    try {
      if (!item || typeof item !== 'object') return { ok: false };
      if (!store.get('notifyEnabled')) return { ok: false, reason: 'disabled' };
      if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' };
      // id 중복 제거(여러 webview 가 같은 알림을 넘길 수 있음). 10분 창으로 정리.
      const now = Date.now();
      for (const [k, t] of shownWebNotif) if (now - t > 10 * 60 * 1000) shownWebNotif.delete(k);
      if (item.id != null) {
        if (shownWebNotif.has(String(item.id))) return { ok: true, deduped: true };
        shownWebNotif.set(String(item.id), now);
      }
      const url = absUrl(item.url);
      // live 방송이면 '방송 시작 시 브라우저로 열기' 설정에 따라 자동으로 연다.
      //  어떤 스텔라를 받을지(구독)는 웹 계정이 정하고, 그중 '브라우저로 열 스텔라'는
      //  autoOpenList(slug 배열, null=전체)로 추린다. slug 는 웹이 넘겨 주거나 url 에서 뽑는다.
      //  url(=/go/live/slug)은 웹에서 치지직으로 리다이렉트된다.
      const slug = item.slug || (item.url && String(item.url).match(/\/go\/live\/([^/?#]+)/)?.[1]) || '';
      const openList = store.get('autoOpenList'); // null/undefined = 신청한 스텔라 전체
      const inOpenList = openList == null || (Array.isArray(openList) && openList.includes(slug));
      if (item.kind === 'live' && store.get('autoOpenLive') && inOpenList && url) safeOpenExternal(url);
      const n = new Notification({
        title: item.title || '스텔라리움',
        body: item.body || '',
        icon: notifyIcon(),
        silent: false,
      });
      n.on('click', () => { if (url) safeOpenExternal(url); showWindow(); });
      n.on('failed', (_e2, err) => console.error('알림 표시 실패(web mirror):', err));
      n.show();
      return { ok: true };
    } catch (e) { return { ok: false, reason: String(e) }; }
  });

  // 알림 테스트 — [테스트] 버튼용. 구독/알림 설정과 무관하게 한 번 띄운다.
  // 버튼을 눌렀는데도 알림이 안 보이면 앱이 아니라 OS(알림 권한/집중모드) 쪽 문제임을 알 수 있다.
  ipcMain.handle('notify:test', () => {
    if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' };
    // show() 직후 바로 반환하면 macOS 의 비동기 'failed'(예: 알림 권한 꺼짐 → UNErrorDomain 오류 1)를
    // 놓쳐 UI 가 '보냈어요'로 오인한다. show/failed 이벤트를 잠깐 기다렸다가 실제 결과를 돌려준다.
    return new Promise((resolve) => {
      let settled = false;
      const finish = (r) => { if (!settled) { settled = true; resolve(r); } };
      try {
        const n = new Notification({
          title: i18n.t('notify.testTitle'),
          body: i18n.t('notify.testBody'),
          icon: notifyIcon(),
          silent: false,
        });
        n.on('click', () => showWindow());
        n.on('show', () => finish({ ok: true }));
        n.on('failed', (_e, err) => { console.error('알림 표시 실패(test):', err); finish({ ok: false, reason: String(err || 'failed') }); });
        n.show();
        // 일부 환경은 show/failed 를 발생시키지 않으므로, 1.5초 내 아무 이벤트도 없으면 성공으로 간주.
        setTimeout(() => finish({ ok: true }), 1500);
      } catch (e) {
        finish({ ok: false, reason: String(e?.message || e) });
      }
    });
  });

  // 방송 제목 번역(베스트 에포트). 렌더러가 en/ja 일 때만 호출한다.
  ipcMain.handle('i18n:translate', async (_e, payload) => {
    try { return await translateBatch(payload?.texts, payload?.target); }
    catch { return {}; }
  });

  // 스케줄(뱅온·캘린더)은 로컬 치지직에서 더 이상 받아오지 않는다 — 스텔라리움 웹의 캘린더를
  //  webview 로 임베드해 보여준다. 남아 있는 네이티브 대시보드 경로가 호출해도 빈 목록을 돌려준다.
  ipcMain.handle('schedule:today', async () => []);
  ipcMain.handle('schedule:range', async () => []);
  ipcMain.handle('schedule:artist', async () => []);

  ipcMain.handle('open:external', (_e, url) => {
    safeOpenExternal(url);
  });

  // web(stellarium.kr) 임베드 주소들. (기준 주소 webBase 는 모듈 상단에 정의)
  ipcMain.handle('app:webCalUrl', () => process.env.STELLA_WEB_CAL_URL || `${webBase()}/calendar`);
  // 스텔라리움(통합) 화면으로 임베드할 홈 주소.
  ipcMain.handle('app:webHomeUrl', () => `${webBase()}/`);

  // 통합 설문 — webview 로 web /survey 를 띄운다. `?embed=1` 은 "앱 임베드"라는 신호로,
  // web 이 이걸 보면 사이트 헤더/푸터 없이 전체 화면으로 그린다. **중복 방지를 위해 이제
  // 스텔라리움 로그인이 필요**하다 — 참여는 webview 안에서 로그인한 계정으로 이뤄진다.
  ipcMain.handle('survey:url', () => `${webBase()}/survey?embed=1`);
  // 배너를 띄울지 판단하려고 진행 여부만 받아온다(집계·개인 선택은 안 받는다 — 메인 프로세스
  // fetch 에는 로그인 쿠키가 없어 choice 는 늘 null 이다. 참여 여부는 webview 안에서 확인된다).
  ipcMain.handle('survey:status', async () => {
    try {
      const r = await fetch(`${webBase()}/api/survey`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return { open: false, choice: null };
      const d = await r.json();
      return { open: Boolean(d.open), choice: d.choice ?? null };
    } catch { return { open: false, choice: null }; }
  });
  // 배너를 닫았는지(다시 안 띄우기) 플래그.
  ipcMain.handle('survey:dismiss', () => { store.set('surveyBannerDismissed', true); return true; });
  ipcMain.handle('survey:dismissed', () => Boolean(store.get('surveyBannerDismissed')));

  ipcMain.handle('update:check', () => {
    if (isDev) {
      // 개발 모드(패키징 전)에서는 업데이트를 확인할 수 없다.
      mainWindow?.webContents.send('update:status', { state: 'dev' });
      return;
    }
    updater.check({ manual: true });
  });
  // 웹(/setting)용 — 결과를 즉시 반환한다({ state:'none'|'available'|'error'|'dev', version?, ... }).
  ipcMain.handle('update:checkWeb', async () => {
    if (isDev) return { state: 'dev' };
    try { return await updater.check({ manual: true }); }
    catch (e) { return { state: 'error', message: String(e?.message || e) }; }
  });
  // [설치하기] — 일반 업데이트는 이때 비로소 다운로드하고, 복사/설치는 인스톨러에 넘긴다.
  // (isQuitting 은 실제 설치 실행 시 app.quit → before-quit 에서 설정된다.
  //  다운로드가 실패해 설치로 넘어가지 않으면 앱은 계속 트레이에 상주한다.)
  ipcMain.handle('update:install', () => {
    updater.downloadAndInstall();
  });

  ipcMain.handle('app:version', () => appVersion());
  ipcMain.handle('app:changelog', () => updater.getReleases());

  // 진단 정보(버그 신고용). 사용자가 자기 시스템 정보를 몰라도 그대로 복사해 붙여넣을 수 있게 한다.
  ipcMain.handle('app:diagnostics', () => ({
    version: appVersion(),
    beta: !!store.get('betaChannel'),
    platform: process.platform,                 // 'darwin' | 'win32' | ...
    arch: process.arch,                          // 'arm64' | 'x64' | ...
    osVersion: (() => { try { return process.getSystemVersion(); } catch { return ''; } })(), // 예: macOS '26.6.1'
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }));

  // 클립보드 복사(렌더러가 만든 문자열을 그대로 복사). file:// 환경에서 navigator.clipboard 가
  // 막히는 경우가 있어, 안전하게 메인 프로세스의 Electron clipboard 로 복사한다.
  ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text ?? '')); return true; });

  // 앱 제거 — 설치 폴더의 제거 프로그램 실행
  ipcMain.handle('app:uninstall', async () => {
    const uninstaller = path.join(path.dirname(process.execPath), '스텔라리움 제거.exe');
    if (isDev || !fs.existsSync(uninstaller)) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info', title: '제거', message: '제거 프로그램을 찾을 수 없습니다.',
        detail: '정식 설치본에서만 제거할 수 있습니다.',
      });
      return;
    }
    const r = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['제거', '취소'], defaultId: 1, cancelId: 1,
      title: '스텔라리움 제거', message: '스텔라리움을 제거할까요?',
      detail: '설치된 파일과 바로가기가 삭제됩니다.',
    });
    if (r.response === 0) {
      spawn(uninstaller, ['--uninstall'], { detached: true, stdio: 'ignore' }).unref();
      isQuitting = true;
      app.quit();
    }
  });

  // 커스텀 타이틀바 창 제어
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize-toggle', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.on('window:hide', () => mainWindow?.hide());
}

// ── 앱 수명주기 ───────────────────────────────────────────
app.whenReady().then(async () => {
  registerIpc();
  createWindow();
  createTray();

  // 디스코드 Rich Presence — 스텔라리움 webview 가 이동/제목변경할 때마다 '보는 중' 상태를 갱신한다.
  discord.init();
  app.on('web-contents-created', (_e, contents) => {
    if (!contents.getType || contents.getType() !== 'webview') return;
    const update = () => {
      try {
        const title = (contents.getTitle() || '').replace(/\s*[·|]\s*스텔라리움\s*$/u, '').trim();
        discord.setPresence(presenceFor(contents.getURL() || '', title));
      } catch { /* ignore */ }
    };
    contents.on('did-navigate', update);
    contents.on('did-navigate-in-page', update);
    contents.on('page-title-updated', update);

    // 외부 링크(유튜브·치지직 등)는 앱 안에서 열지 않고 기본 브라우저 새 탭으로 연다.
    //  - 스텔라리움/로그인 URL 만 webview 안에서 이동(SPA 내부 이동은 will-navigate 가 아니므로 영향 없음).
    contents.on('will-navigate', (e, url) => {
      if (!keepInApp(url)) { e.preventDefault(); safeOpenExternal(url); }
    });
    contents.on('will-redirect', (e, url) => {
      if (!keepInApp(url)) { e.preventDefault(); safeOpenExternal(url); }
    });
    // target=_blank · window.open 으로 새 창을 띄우려는 경우: 외부는 브라우저로, 내부는 현재 뷰에서 이동.
    contents.setWindowOpenHandler(({ url }) => {
      if (keepInApp(url)) { contents.loadURL(url); }
      else { safeOpenExternal(url); }
      return { action: 'deny' };
    });
  });

  // 로그인 시 자동 실행 설정 반영
  applyLaunchAtStartup(store.get('launchAtStartup'));

  // 로컬 치지직 폴링은 완전히 제거됐다 — 알림·브라우저 자동 열기는 모두 스텔라리움 계정
  //  데이터(로그인된 webview inbox → components/AppNotifyMirror → notify:fromWeb)에서만 온다.

  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('window-all-closed', () => {
  // 트레이 상주 앱이므로 창이 모두 닫혀도 종료하지 않는다(트레이 최소화 시).
  if (!store.get('minimizeToTray')) quitApp();
});

app.on('before-quit', () => {
  isQuitting = true;
});
