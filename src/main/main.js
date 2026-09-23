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
const { Poller, MIN_INTERVAL_SEC } = require('./poller');

// 표시/업데이트용 버전. package.json 의 version 은 빌드 도구(electron-builder) 요구로 3자리 semver 여야 하므로,
// 베타의 4자리 표기(예: 1.0.5.1)는 fullVersion 에 두고 앱 전반에서 이 값을 쓴다.
let PKG_FULL_VERSION = '';
try { PKG_FULL_VERSION = require('../../package.json').fullVersion || ''; } catch { /* ignore */ }
function appVersion() { return PKG_FULL_VERSION || app.getVersion(); }

const APP_ID = 'com.stellastatus.app';
const ICON_PATH = path.join(app.getAppPath(), 'build', 'icon.png');
const isDev = process.argv.includes('--dev') || !app.isPackaged;

let mainWindow = null;
let tray = null;
let isQuitting = false;
const poller = new Poller();

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
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 15 } }
      : { frame: false }),
    backgroundColor: '#0b0a1a',
    icon: ICON_PATH,
    title: '스텔라상태',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 캘린더는 web(stellarium.kr/calendar)을 <webview> 로 임베드해 쓴다.
      webviewTag: true,
    },
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
  tray.setToolTip('스텔라상태');
  rebuildTrayMenu([]);
  tray.on('double-click', () => showWindow());
  tray.on('click', () => showWindow());
}

let lastTrayMembers = [];
function rebuildTrayMenu(members) {
  if (!tray) return;
  lastTrayMembers = members; // 언어 변경 시 같은 목록으로 다시 그리기 위해 보관
  const live = members.filter((m) => m.isLive);
  const liveItems = live.length
    ? live.map((m) => ({
        label: `🔴 ${i18n.memberName(m)}  ${m.viewerCount != null ? i18n.t('tray.viewers', { n: m.viewerCount.toLocaleString() }) : ''}`,
        click: () => shell.openExternal(m.liveUrl),
      }))
    : [{ label: i18n.t('tray.noLive'), enabled: false }];

  const menu = Menu.buildFromTemplate([
    { label: i18n.t('tray.header', { n: live.length }), enabled: false },
    { type: 'separator' },
    ...liveItems,
    { type: 'separator' },
    { label: i18n.t('tray.open'), click: () => showWindow() },
    { label: i18n.t('tray.refresh'), click: () => poller.pollOnce() },
    { type: 'separator' },
    { label: i18n.t('tray.quit'), click: () => quitApp() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(i18n.t('tray.tooltip', { n: live.length }));
}

function quitApp() {
  isQuitting = true;
  poller.stop();
  app.quit();
}

// ── 알림 ──────────────────────────────────────────────────
function isSubscribed(key) {
  const subs = store.get('subscribed');
  return subs == null || (Array.isArray(subs) && subs.includes(key));
}

function maybeAutoOpen(member) {
  if (!store.get('autoOpenLive')) return;
  const list = store.get('autoOpenList'); // null = 전체
  if (Array.isArray(list) && !list.includes(member.key)) return;
  if (member.liveUrl) shell.openExternal(member.liveUrl);
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

function notifyLive(member) {
  if (!store.get('notifyEnabled')) return;
  if (!isSubscribed(member.key)) return;
  if (!Notification.isSupported()) return;

  const n = new Notification({
    title: i18n.t('notify.liveTitle', { name: i18n.memberName(member) }),
    body: member.title || i18n.t('notify.liveBody'),
    icon: notifyIcon(),
    silent: false,
  });
  n.on('click', () => shell.openExternal(member.liveUrl));
  n.on('failed', (_e, err) => console.error('알림 표시 실패(live):', err));
  n.show();
}

// 방송 종료(방종) 알림 — 구독한 멤버가 라이브 → 오프라인으로 바뀌면 알린다.
function notifyOffline(member) {
  if (!store.get('notifyOffline')) return;
  if (!isSubscribed(member.key)) return;
  if (!Notification.isSupported()) return;

  const n = new Notification({
    title: i18n.t('notify.offTitle', { name: i18n.memberName(member) }),
    body: i18n.t('notify.offBody'),
    icon: notifyIcon(),
    silent: false,
  });
  n.on('click', () => shell.openExternal(member.channelUrl || member.liveUrl || 'https://chzzk.naver.com'));
  n.on('failed', (_e, err) => console.error('알림 표시 실패(off):', err));
  n.show();
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
  ipcMain.handle('members:get', () => poller.members);
  ipcMain.handle('members:refresh', () => poller.pollOnce());

  ipcMain.handle('settings:get', () => store.store);
  ipcMain.handle('settings:set', (_e, patch) => {
    const before = store.store;
    store.set(patch);
    if ('pollIntervalSec' in patch) poller.setInterval(patch.pollIntervalSec);
    if ('launchAtStartup' in patch && patch.launchAtStartup !== before.launchAtStartup) {
      applyLaunchAtStartup(patch.launchAtStartup);
    }
    // 언어가 바뀌면 트레이 메뉴/툴팁을 새 언어로 다시 그린다(알림은 표시 시점에 현재 언어 사용).
    if ('language' in patch && patch.language !== before.language) {
      rebuildTrayMenu(lastTrayMembers);
    }
    return store.store;
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

  ipcMain.handle('schedule:today', async () => {
    try {
      // 어제 00:00 ~ 오늘 23:59(KST)까지 받아온다. 어제 시작해 오늘까지 이어지는 방송을
      // '오늘의 뱅온'에 반영할 수 있도록(실제 표시 여부는 렌더러가 라이브 여부로 판단).
      const KST = 9 * 60 * 60 * 1000;
      const now = new Date(Date.now() + KST); // UTC 필드 = KST 벽시계
      const p = (n) => String(n).padStart(2, '0');
      const dstr = (d) => `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const yesterday = new Date(today.getTime() - 86400000);
      return await poller.client.schedule.getSchedules({
        after: `${dstr(yesterday)}T00:00:00`,
        before: `${dstr(today)}T23:59:59`,
        size: 1000,
      });
    } catch (e) {
      return { error: String(e?.message || e) };
    }
  });
  // 기간(캘린더 표시 범위) 스케줄 — after/before 는 ISO 문자열.
  ipcMain.handle('schedule:range', async (_e, { after, before } = {}) => {
    try {
      return await poller.client.schedule.getSchedules({ after, before, size: 1000 });
    } catch (e) {
      return { error: String(e?.message || e) };
    }
  });
  ipcMain.handle('schedule:artist', async (_e, key) => {
    try {
      return await poller.client.schedule.getArtistSchedule(key);
    } catch (e) {
      return { error: String(e?.message || e) };
    }
  });

  ipcMain.handle('open:external', (_e, url) => {
    if (typeof url === 'string' && /^(https?:\/\/|mailto:)/.test(url)) shell.openExternal(url);
  });

  // web(stellarium.kr) 기준 주소 — 개발 모드는 로컬 web 서버, 배포는 stellarium.kr.
  // (환경변수 STELLA_WEB_BASE 로 재정의 가능)
  const webBase = () => process.env.STELLA_WEB_BASE || (isDev ? 'http://localhost:3000' : 'https://stellarium.kr');
  ipcMain.handle('app:webCalUrl', () => process.env.STELLA_WEB_CAL_URL || `${webBase()}/calendar`);

  // 통합 설문 — 익명 기기 id(개인정보 아님)를 만들어 두고, webview 주소·현재 상태를 렌더러에 준다.
  const surveyDeviceId = () => {
    let id = store.get('surveyDeviceId');
    if (!id) { id = randomUUID(); store.set('surveyDeviceId', id); }
    return id;
  };
  ipcMain.handle('survey:url', () => `${webBase()}/survey?d=${encodeURIComponent(surveyDeviceId())}`);
  // 앱이 '설문 배너'를 띄울지 판단하려고 진행 여부·내 선택만 받아온다(집계는 안 받는다).
  ipcMain.handle('survey:status', async () => {
    try {
      const r = await fetch(`${webBase()}/api/survey?d=${encodeURIComponent(surveyDeviceId())}`, { signal: AbortSignal.timeout(5000) });
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
    const uninstaller = path.join(path.dirname(process.execPath), '스텔라상태 제거.exe');
    if (isDev || !fs.existsSync(uninstaller)) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info', title: '제거', message: '제거 프로그램을 찾을 수 없습니다.',
        detail: '정식 설치본에서만 제거할 수 있습니다.',
      });
      return;
    }
    const r = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['제거', '취소'], defaultId: 1, cancelId: 1,
      title: '스텔라상태 제거', message: '스텔라상태를 제거할까요?',
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

  // 로그인 시 자동 실행 설정 반영
  applyLaunchAtStartup(store.get('launchAtStartup'));

  // 폴러 이벤트 연결
  poller.on('update', (members) => {
    rebuildTrayMenu(members);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('members:update', members);
    }
  });
  poller.on('transitions', ({ wentLive, wentOffline }) => {
    wentLive.forEach((m) => {
      notifyLive(m);
      maybeAutoOpen(m);
    });
    (wentOffline || []).forEach((m) => notifyOffline(m));
    // 앱이 열려 있으면 인앱 플로팅 알림도 함께 표시
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('members:live', wentLive);
    }
  });
  poller.on('polling', (busy) => {
    mainWindow?.webContents.send('members:polling', busy);
  });
  poller.on('error', (err) => {
    mainWindow?.webContents.send('members:error', String(err?.message || err));
  });

  await poller.init().catch(() => {});
  poller.start(store.get('pollIntervalSec'));

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
