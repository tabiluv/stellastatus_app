// 스텔라리움 커스텀 인스톨러 — 설치/제거 핵심 로직 (per-user, 관리자 권한 불필요)
const { app, shell } = require('electron');
// original-fs 는 Electron 의 asar 패치가 적용되지 않은 원본 fs.
// 이걸 써야 app.asar 를 (가상 폴더가 아니라) 파일 하나로 복사한다.
const fs = require('original-fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');

const APP_NAME = '스텔라리움';
const APP_EXE = '스텔라리움.exe';
const UNINSTALL_EXE = '스텔라리움 제거.exe';
// 리브랜딩 전(스텔라상태) 실행파일·제거파일·바로가기 이름 — 구버전에서 업데이트할 때 종료·정리 대상.
const LEGACY_EXE = '스텔라상태.exe';
const LEGACY_UNINSTALL_EXE = '스텔라상태 제거.exe';
const LEGACY_NAME = '스텔라상태';
const PUBLISHER = '스텔라리움';
// 메인 앱이 setAppUserModelId 로 쓰는 값과 반드시 동일해야 한다.
// 이 값이 시작 메뉴 바로가기에 박혀 있어야 윈도우 토스트 알림이 AUMID('com.stellastatus.app')
// 대신 바로가기 이름('스텔라리움')으로 표시된다.
const APP_AUMID = 'com.stellastatus.app';
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StellaStatus';

// 배포 시 payload(앱 본체)는 리소스로 동봉된다. 개발 중엔 STELLA_PAYLOAD 로 지정 가능.
function payloadDir() {
  if (process.env.STELLA_PAYLOAD) return process.env.STELLA_PAYLOAD;
  return path.join(process.resourcesPath || app.getAppPath(), 'payload');
}

function defaultInstallDir() {
  const base = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  return path.join(base, 'Programs', APP_NAME);
}

// 실제 실행된 setup exe 경로(portable). 제거 프로그램으로 복사하기 위함.
function selfExe() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

async function listFiles(dir) {
  const out = [];
  async function walk(d) {
    const entries = await fsp.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(dir);
  return out;
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true }, (err, stdout) => resolve({ err, stdout }));
  });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// 지정한 이미지 이름의 프로세스가 아직 실행 중인지 확인
async function isExeRunning(imageName) {
  const { stdout } = await run('tasklist', ['/FI', `IMAGENAME eq ${imageName}`, '/NH']);
  return (stdout || '').toLowerCase().includes(imageName.toLowerCase());
}

// 프로세스가 완전히 종료될 때까지(파일 잠금 해제까지) 대기
async function waitForExeGone(imageName, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (!(await isExeRunning(imageName))) return; } catch { return; }
    await delay(150);
  }
}

// 방금 종료한 앱의 exe/DLL 핸들이 늦게 풀리는 경우를 대비한 복사 재시도
async function copyFileWithRetry(from, to, tries = 25) {
  for (let i = 0; ; i++) {
    try { await fsp.copyFile(from, to); return; }
    catch (e) {
      if (i >= tries || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e;
      await delay(200);
    }
  }
}

// ── 설치 ─────────────────────────────────────
async function install({ targetDir, desktopShortcut = true, startMenuShortcut = true, update = false, onProgress = () => {} }) {
  const src = payloadDir();
  if (!fs.existsSync(src) || (await fsp.readdir(src).catch(() => [])).length === 0) {
    throw new Error('설치 파일이 손상되었거나 보안 프로그램에 의해 일부가 차단되었을 수 있습니다.\n파일을 다시 내려받아 실행해 주세요.');
  }
  const dest = targetDir || defaultInstallDir();

  onProgress({ phase: 'prepare', percent: 0, text: update ? '업데이트를 준비하는 중…' : '설치를 준비하는 중…' });

  // 실행 중인 앱 종료(재설치 시 파일 잠금 방지)
  // ⚠️ '/T'(자식 트리 종료)를 쓰면 안 된다. 업데이트/제거 시 이 인스톨러는 방금
  //    종료 대상인 앱(스텔라리움.exe)이 spawn 한 '자식 프로세스'로 실행되므로,
  //    /T 가 트리를 타고 내려와 인스톨러 자신까지 강제 종료해 버린다
  //    (= 설치 진행 중 창이 그냥 사라짐). 이미지 이름으로만 종료한다.
  // ⚠️ 리브랜딩(스텔라상태 → 스텔라리움)으로 실행파일 이름이 바뀌었다. 구버전(스텔라상태.exe)에서
  //    업데이트하는 경우 지금 실행 중인 건 '옛 이름'이라, 신 이름만 종료하면 옛 프로세스가 살아
  //    파일을 잠근 채라 복사가 EBUSY(chrome_100_percent.pak 등)로 실패한다. 신·구 이름을 모두 종료한다.
  const KILL_EXES = [APP_EXE, LEGACY_EXE];
  for (const exe of KILL_EXES) await run('taskkill', ['/F', '/IM', exe]);
  // 강제 종료 직후엔 exe/DLL 핸들이 잠깐 남아 복사가 EBUSY 로 실패할 수 있으므로
  // 프로세스가 실제로 사라질 때까지 잠시 대기한다.
  for (const exe of KILL_EXES) await waitForExeGone(exe, 5000);

  const files = await listFiles(src);
  const total = files.length || 1;
  await fsp.mkdir(dest, { recursive: true });

  let done = 0;
  for (const file of files) {
    const rel = path.relative(src, file);
    const to = path.join(dest, rel);
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await copyFileWithRetry(file, to);
    done += 1;
    if (done % 5 === 0 || done === total) {
      onProgress({ phase: 'copy', percent: Math.round((done / total) * 92), done, total, text: `파일 복사 중… (${done}/${total})` });
    }
  }

  // 제거 프로그램(현재 setup exe) 복사
  onProgress({ phase: 'register', percent: 94, text: '바로가기와 등록 정보를 만드는 중…' });
  const uninstallerPath = path.join(dest, UNINSTALL_EXE);
  try { await fsp.copyFile(selfExe(), uninstallerPath); } catch { /* portable 아닌 경우 무시 */ }

  const exePath = path.join(dest, APP_EXE);
  const iconPath = exePath;

  // 바로가기.
  // 시작 메뉴 바로가기는 토스트 알림의 앱 이름(AppUserModelID) 연결에 쓰이므로
  // 설치·업데이트 모두에서 보장한다(기존 사용자도 업데이트 시 알림 이름이 바로잡힌다).
  // 바탕화면 바로가기는 신규 설치에서 선택한 경우에만 만들고, 업데이트 시엔 건드리지 않는다.
  const startDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  await fsp.mkdir(startDir, { recursive: true });
  if (update || startMenuShortcut) {
    writeShortcut(path.join(startDir, `${APP_NAME}.lnk`), exePath, iconPath);
  }
  if (!update && desktopShortcut) {
    writeShortcut(path.join(app.getPath('desktop'), `${APP_NAME}.lnk`), exePath, iconPath);
  }

  // 언인스톨 레지스트리(제어판 프로그램 목록) — 버전 갱신 포함
  await writeUninstallRegistry(dest, uninstallerPath, exePath);

  // 리브랜딩 전(스텔라상태) 잔재 정리 — 구버전에서 업데이트한 경우에만 실제로 지워진다(없으면 무해).
  //  옛 실행파일/제거파일이 남으면 오래된 바로가기로 구버전이 계속 실행되고, 제어판에도 중복으로 보인다.
  await fsp.rm(path.join(dest, LEGACY_EXE), { force: true }).catch(() => {});
  await fsp.rm(path.join(dest, LEGACY_UNINSTALL_EXE), { force: true }).catch(() => {});
  await fsp.rm(path.join(startDir, `${LEGACY_NAME}.lnk`), { force: true }).catch(() => {});
  try { await fsp.rm(path.join(app.getPath('desktop'), `${LEGACY_NAME}.lnk`), { force: true }); } catch { /* ignore */ }

  onProgress({ phase: 'done', percent: 100, text: update ? '업데이트가 완료되었습니다.' : '설치가 완료되었습니다.' });
  return { installDir: dest, exePath };
}

function writeShortcut(linkPath, target, icon, args) {
  try {
    shell.writeShortcutLink(linkPath, 'create', {
      target,
      args: args || '',
      cwd: path.dirname(target),
      icon,
      iconIndex: 0,
      appUserModelId: APP_AUMID, // 토스트 알림이 이 바로가기(=스텔라리움)와 연결되도록
      description: APP_NAME,
    });
  } catch (e) {
    /* 바로가기 실패는 치명적이지 않음 */
  }
}

async function dirSizeKB(dir) {
  try {
    const files = await listFiles(dir);
    let bytes = 0;
    for (const f of files) { try { bytes += (await fsp.stat(f)).size; } catch {} }
    return Math.round(bytes / 1024);
  } catch { return 0; }
}

async function writeUninstallRegistry(installDir, uninstallerPath, exePath) {
  const version = app.getVersion();
  const sizeKB = await dirSizeKB(installDir);
  const set = (name, type, value) => run('reg', ['add', UNINSTALL_KEY, '/v', name, '/t', type, '/d', String(value), '/f']);
  await set('DisplayName', 'REG_SZ', APP_NAME);
  await set('DisplayVersion', 'REG_SZ', version);
  await set('Publisher', 'REG_SZ', PUBLISHER);
  await set('DisplayIcon', 'REG_SZ', exePath);
  await set('InstallLocation', 'REG_SZ', installDir);
  await set('UninstallString', 'REG_SZ', `"${uninstallerPath}" --uninstall`);
  await set('EstimatedSize', 'REG_DWORD', sizeKB);
  await set('NoModify', 'REG_DWORD', 1);
  await set('NoRepair', 'REG_DWORD', 1);
}

function launch(exePath) {
  const { spawn } = require('child_process');
  spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
}

// ── 제거 ─────────────────────────────────────
async function uninstall({ onProgress = () => {} } = {}) {
  onProgress({ phase: 'prepare', percent: 5, text: '제거를 준비하는 중…' });
  // 업데이트와 동일한 이유로 '/T' 를 쓰지 않는다(제거 프로그램도 앱의 자식 프로세스).
  for (const exe of [APP_EXE, LEGACY_EXE]) await run('taskkill', ['/F', '/IM', exe]);
  for (const exe of [APP_EXE, LEGACY_EXE]) await waitForExeGone(exe, 5000);

  // 설치 위치 파악
  const q = await run('reg', ['query', UNINSTALL_KEY, '/v', 'InstallLocation']);
  let installDir = defaultInstallDir();
  const m = /InstallLocation\s+REG_SZ\s+(.+)/.exec(q.stdout || '');
  if (m) installDir = m[1].trim();

  onProgress({ phase: 'remove', percent: 40, text: '파일을 삭제하는 중…' });
  // 바로가기 제거
  try { await fsp.rm(path.join(app.getPath('desktop'), `${APP_NAME}.lnk`), { force: true }); } catch {}
  try { await fsp.rm(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${APP_NAME}.lnk`), { force: true }); } catch {}
  // 레지스트리 제거
  await run('reg', ['delete', UNINSTALL_KEY, '/f']);

  onProgress({ phase: 'cleanup', percent: 70, text: '설치 폴더를 정리하는 중…' });
  // 설치 폴더 삭제(자기 자신=제거 exe 는 나중에 정리)
  try {
    const entries = await fsp.readdir(installDir);
    for (const name of entries) {
      if (name === UNINSTALL_EXE) continue;
      await fsp.rm(path.join(installDir, name), { recursive: true, force: true });
    }
  } catch {}

  // 제거 exe 자신은 재부팅 후 삭제되도록 예약(간단히: 배치로 지연 삭제)
  scheduleSelfDelete(installDir);

  onProgress({ phase: 'done', percent: 100, text: '제거가 완료되었습니다.' });
  return { installDir };
}

function scheduleSelfDelete(installDir) {
  try {
    const bat = path.join(require('os').tmpdir(), 'stella_uninstall_cleanup.bat');
    const content =
      '@echo off\r\n' +
      'ping 127.0.0.1 -n 3 > nul\r\n' +
      `rmdir /s /q "${installDir}"\r\n` +
      `del "%~f0"\r\n`;
    fs.writeFileSync(bat, content);
    const { spawn } = require('child_process');
    spawn('cmd', ['/c', bat], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {}
}

module.exports = { install, uninstall, defaultInstallDir, launch, APP_NAME };
