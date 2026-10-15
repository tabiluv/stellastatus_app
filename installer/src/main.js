const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const core = require('./installer-core');

// 설치 시 선택한 언어를 앱(StellaStatus)의 설정 파일에 기록한다.
//  - 앱은 electron-store 로 %APPDATA%/StellaStatus/config.json 을 읽는다(앱 name=productName='StellaStatus').
//  - 첫 실행 전에 language 를 심어두면 앱이 그 언어로 시작한다. (기존 설정이 있으면 병합)
function writeAppLanguage(lang) {
  try {
    if (!['ko', 'en', 'ja'].includes(lang)) return;
    const roaming = process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming');
    const dir = path.join(roaming, 'StellaStatus');
    const file = path.join(dir, 'config.json');
    fs.mkdirSync(dir, { recursive: true });
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* 없으면 새로 */ }
    cfg.language = lang;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  } catch { /* 설정 기록 실패는 설치를 막지 않는다 */ }
}

const isUninstall = process.argv.includes('--uninstall');
const isUpdate = process.argv.includes('--update');
const isDev = process.argv.includes('--dev');
const dirIdx = process.argv.indexOf('--dir');
const targetDirArg = dirIdx >= 0 ? process.argv[dirIdx + 1] : null;
const langIdx = process.argv.indexOf('--lang'); // 앱이 업데이트/제거 시 전달하는 언어
const langArg = langIdx >= 0 ? process.argv[langIdx + 1] : null;
let win = null;

app.setAppUserModelId('com.stellastatus.installer');

function createWindow() {
  win = new BrowserWindow({
    width: isUpdate ? 460 : 760,
    height: isUpdate ? 250 : 540,
    resizable: false,
    frame: false,
    backgroundColor: '#1a1418',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    title: '스텔라리움 설치',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.whenReady().then(() => {
    createWindow();
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('boot', {
        mode: isUninstall ? 'uninstall' : isUpdate ? 'update' : 'install',
        appName: core.APP_NAME,
        version: app.getVersion(),
        defaultDir: core.defaultInstallDir(),
        targetDir: targetDirArg || core.defaultInstallDir(),
        lang: langArg,
      });
    });
  });
}

app.on('window-all-closed', () => app.quit());

// ── IPC ───────────────────────────────────────
ipcMain.handle('choose-dir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});

ipcMain.handle('install', async (_e, opts) => {
  try {
    const result = await core.install({
      ...opts,
      onProgress: (p) => win.webContents.send('progress', p),
    });
    // 선택한 언어를 앱 설정에 기록(업데이트 모드에서는 기존 언어 유지 위해 건너뜀)
    if (opts && opts.language && !opts.update) writeAppLanguage(opts.language);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('uninstall', async () => {
  try {
    const result = await core.uninstall({ onProgress: (p) => win.webContents.send('progress', p) });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('launch', (_e, exePath) => { core.launch(exePath); });
ipcMain.handle('open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

ipcMain.on('win-minimize', () => win && win.minimize());
ipcMain.on('win-close', () => app.quit());
