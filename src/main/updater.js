// 자체 업데이터 — GitHub Releases 를 확인해 새 버전의 Setup.exe 를 받아 실행한다.
// (커스텀 인스톨러를 쓰므로 electron-updater 대신 사용)
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, shell } = require('electron');
const { spawn } = require('child_process');
const store = require('./store');

// 버전 문자열이 베타(4자리, 예: 1.0.5.1)인지. 정식은 3자리(1.0.5).
function isBetaVersion(v) {
  return String(v || '').replace(/^v/, '').split('.').filter((s) => s !== '').length >= 4;
}

// 베타 채널로 취급할지 여부.
//  - 설정의 '베타 버전 받기'가 켜져 있으면 베타.
//  - 또는 '현재 설치된 버전 자체가 베타'면 토글과 무관하게 베타로 취급한다.
//    (베타를 설치한 사용자가 토글을 안 켰더라도 계속 베타 업데이트/기록을 받도록.
//     이후 정식 버전으로 올라가면 자동으로 정식 채널로 돌아온다.)
function wantsBeta() {
  try { if (store.get('betaChannel')) return true; } catch { /* ignore */ }
  return isBetaVersion(currentVersion());
}

let OWNER = '';
let REPO = '';
try {
  const pkg = require('../../package.json');
  const m = /github\.com[/:]([^/]+)\/([^/.]+)(\.git)?/.exec(pkg.repository?.url || '');
  if (m) { OWNER = m[1]; REPO = m[2]; }
} catch { /* ignore */ }

// 앱의 '현재 버전'. package.json 의 version 은 electron-builder 요구사항 때문에 유효한 semver(3자리)여야 해서,
// 베타는 4자리 표기(예: 1.0.5.1)를 fullVersion 에 따로 둔다. 업데이트 비교/표시는 이 값을 쓴다(태그 이름과 같은 체계).
function currentVersion() {
  try {
    const pkg = require('../../package.json');
    return pkg.fullVersion || pkg.version || app.getVersion();
  } catch {
    return app.getVersion();
  }
}

let emit = () => {};
let downloadedPath = null;
// 일반(비필수) 업데이트는 [설치하기]를 누를 때까지 다운로드를 보류한다.
// check() 에서 찾은 에셋 정보를 여기 담아두고, downloadAndInstall() 에서 사용한다.
let pendingDownload = null; // { url, name, info }

function init(emitter) { emit = emitter || (() => {}); }

function ghGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'stellastatus', Accept: 'application/vnd.github+json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(ghGet(res.headers.location));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('GitHub HTTP ' + res.statusCode)); }
      // 청크를 Buffer 로 모아 마지막에 UTF-8 로 디코딩(한글이 청크 경계에서 깨지는 것 방지)
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// 버전 비교. 정식은 3자리(x.y.z), 베타는 4자리(x.y.z.n)까지 온다.
// 자리 수가 다르면 없는 자리는 0 으로 채워 비교하므로 v1.0.5.1 > v1.0.5, v1.0.6 > v1.0.5.9 가 성립한다.
function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function download(url, dest, onProgress) {
  // 받는 동안은 '.part' 임시 파일에 쓰고, 완료되면 최종 이름으로 바꾼다.
  // %TEMP%\Setup.exe 같은 이름/경로에 exe 를 직접 쓰면 백신(알약 등)이 쓰는 도중
  // 잠그거나 격리해 '내려받기 오류'가 나기 쉬운데, .part 로 받으면 그 간섭이 크게 준다.
  const tmp = dest + '.part';
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'stellastatus' } }, (res) => {
      req.setTimeout(0); // 응답이 시작됐으니 '연결' 타임아웃은 해제하고, 이후엔 아래 스톨 타이머가 관리
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest, onProgress));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('다운로드 실패 HTTP ' + res.statusCode)); }
      const total = Number(res.headers['content-length'] || 0);
      let got = 0;
      let settled = false;
      let stall = null;
      const file = fs.createWriteStream(tmp);
      // 네트워크가 중간에 끊기면 res 스트림에서 error 가 나는데, 이를 처리하지 않으면
      // 프로세스가 죽거나(무처리 예외) 다운로드가 영영 끝나지 않는다. 여기서 깔끔히 실패 처리한다.
      const fail = (err) => {
        if (settled) return; settled = true;
        clearTimeout(stall);
        try { res.destroy(); } catch { /* ignore */ }
        try { file.destroy(); } catch { /* ignore */ }
        fs.unlink(tmp, () => reject(err)); // 받다 만 파일 정리 후 실패
      };
      // 데이터가 '전혀' 안 오는 상태가 90초 지속될 때만 멈춘 것으로 보고 실패한다.
      // 매 청크마다 리셋되므로, 느리거나 잠깐 멈칫하는 회선이라도 데이터가 흐르는 한 끊기지 않는다.
      // (기존 30초 고정 타임아웃은 조금만 느려도 오탐으로 '내려받기 오류'를 냈다.)
      const bumpStall = () => { clearTimeout(stall); stall = setTimeout(() => fail(new Error('다운로드가 멈췄습니다(응답 없음).')), 90000); };
      res.on('error', fail);
      file.on('error', fail);
      res.on('data', (c) => { got += c.length; bumpStall(); if (total) onProgress(Math.round((got / total) * 100)); });
      res.pipe(file);
      file.on('finish', () => {
        if (settled) return; settled = true;
        clearTimeout(stall);
        file.close(() => {
          // .part → 최종 이름. 기존 파일이 남아 있으면 지우고(윈도우는 rename 이 덮어쓰기 실패) 바꾼다.
          fs.rm(dest, { force: true }, () => fs.rename(tmp, dest, (e) => (e ? fail(e) : resolve(dest))));
        });
      });
      bumpStall();
    });
    req.on('error', reject);
    // 최초 연결이 안 되는 경우만을 위한 연결 타임아웃(30초). 연결되면 위에서 해제한다.
    req.setTimeout(30000, () => req.destroy(new Error('서버에 연결하지 못했습니다.')));
  });
}

// 릴리스 노트에 <!-- force-update --> 마커가 있으면 강제(취소 불가) 업데이트로 처리
function isMandatory(body) {
  return /<!--\s*force-?update\s*-->/i.test(body || '');
}

// 설치 대상 릴리스를 고른다.
//  - 베타 끔: GitHub 의 'latest'(Pre-release 제외)를 그대로 쓴다.
//  - 베타 켬: 릴리스 목록을 받아 draft 를 뺀 뒤(Pre-release 포함) 버전이 가장 높은 것을 고른다.
async function fetchTargetRelease(beta) {
  if (!beta) {
    return ghGet(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`);
  }
  const list = await ghGet(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=30`);
  if (!Array.isArray(list)) return null;
  const candidates = list.filter((r) => !r.draft);
  if (!candidates.length) return null;
  return candidates.reduce((best, r) => {
    const bv = best.tag_name || best.name || '0';
    const rv = r.tag_name || r.name || '0';
    return cmpVersion(rv, bv) > 0 ? r : best;
  });
}

// 최신 릴리스 확인 → 새 버전이면 알림. 필수는 즉시 자동 다운로드, 일반은 [설치하기] 시 다운로드.
async function check({ manual = false } = {}) {
  // Microsoft Store(MSIX) 배포본은 스토어가 업데이트를 관리한다.
  //  자체 업데이터로 GitHub 의 Setup.exe 를 받아 실행하면 안 되므로(샌드박스/서명 충돌),
  //  스토어에서 실행 중이면 업데이트 확인을 건너뛴다. (process.windowsStore: Store 앱일 때 true)
  if (process.windowsStore) { emit({ state: 'none' }); return { state: 'none' }; }
  if (!OWNER || OWNER === 'YOUR_GITHUB_USERNAME' || !REPO) {
    const st = manual ? 'error' : 'none';
    emit({ state: st, message: '배포 저장소가 설정되지 않았습니다.' });
    return { state: st, message: '배포 저장소가 설정되지 않았습니다.' };
  }
  try {
    emit({ state: 'checking' });
    const beta = wantsBeta();
    const rel = await fetchTargetRelease(beta);
    if (!rel) { emit({ state: 'none' }); return { state: 'none' }; }
    const latest = rel.tag_name || rel.name || '0.0.0';
    if (cmpVersion(latest, currentVersion()) <= 0) { emit({ state: 'none' }); return { state: 'none' }; }

    // 플랫폼별 설치 파일 선택: 맥은 .dmg(아키텍처 매칭), 윈도우는 Setup.exe
    let asset;
    if (process.platform === 'darwin') {
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const dmgs = (rel.assets || []).filter((a) => /\.dmg$/i.test(a.name));
      asset = dmgs.find((a) => new RegExp(arch, 'i').test(a.name)) || dmgs[0];
    } else {
      asset = (rel.assets || []).find((a) => /Setup.*\.exe$/i.test(a.name) || /\.exe$/i.test(a.name));
    }
    if (!asset) { emit({ state: 'error', message: '설치 파일을 찾을 수 없습니다.' }); return { state: 'error', message: '설치 파일을 찾을 수 없습니다.' }; }

    const info = {
      version: String(latest).replace(/^v/, ''),
      mandatory: isMandatory(rel.body),
      beta: !!rel.prerelease, // Pre-release 여부(베타 뱃지 표시용)
      notes: (rel.body || '').replace(/<!--(?!\s*i18n:)[\s\S]*?-->/g, '').trim(),
      repo: `${OWNER}/${REPO}`,
      htmlUrl: rel.html_url || `https://github.com/${OWNER}/${REPO}/releases/latest`,
    };

    // 다운로드에 필요한 정보는 항상 보관한다(필수 자동 다운로드가 실패해도 [지금 설치]로 재시도 가능).
    pendingDownload = { url: asset.browser_download_url, name: asset.name, info };
    downloadedPath = null;

    emit({ state: 'available', ...info });

    // 필수 업데이트만 즉시 자동 다운로드. 일반은 [설치하기]를 누를 때까지 보류한다.
    if (info.mandatory) await downloadPending();
    return { state: 'available', ...info };
  } catch (e) {
    const message = String(e?.message || e);
    emit({ state: 'error', message });
    return { state: 'error', message };
  }
}

// 보관해 둔 pendingDownload 를 실제로 내려받는다(진행률/완료 이벤트 포함).
async function downloadPending() {
  if (!pendingDownload) throw new Error('내려받을 업데이트 정보가 없습니다.');
  const { url, name, info } = pendingDownload;
  const dest = path.join(os.tmpdir(), name);
  emit({ state: 'downloading', percent: 0, ...info });
  // 일시적 네트워크 오류(연결 끊김/멈춤)에 대비해 자동 재시도(최대 3회, 점증 대기).
  const MAX = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      await download(url, dest, (percent) => emit({ state: 'downloading', percent }));
      downloadedPath = dest;
      emit({ state: 'downloaded', ...info });
      return;
    } catch (e) {
      lastErr = e;
      if (attempt >= MAX) break;
      emit({ state: 'downloading', percent: 0, ...info }); // 진행바 초기화하며 재시도
      await new Promise((r) => setTimeout(r, 1500 * attempt)); // 1.5s → 3s 대기 후 재시도
    }
  }
  throw lastErr;
}

// [설치하기] 클릭 시 호출 — 아직 안 받았으면 지금 다운로드한 뒤, 복사/설치는 인스톨러에 넘긴다.
async function downloadAndInstall() {
  try {
    if (!downloadedPath || !fs.existsSync(downloadedPath)) await downloadPending();
    runInstaller();
  } catch (e) {
    // 인앱 다운로드가 재시도까지 다 실패하면(회선/백신 간섭 등), 브라우저로 직접 받도록
    // 대체 경로를 열어 준다. 어떤 이유로든 사용자가 업데이트를 받을 길을 항상 보장.
    const url = (pendingDownload && pendingDownload.url) || `https://github.com/${OWNER}/${REPO}/releases/latest`;
    try { shell.openExternal(url); } catch { /* ignore */ }
    emit({ state: 'manual-download', message: String(e?.message || e) });
  }
}

// 받은 설치 파일을 실행 → (윈도우) 커스텀 인스톨러 무인 업데이트 / (맥) .dmg 열어 수동 설치 안내
function runInstaller() {
  if (!downloadedPath || !fs.existsSync(downloadedPath)) {
    shell.openExternal(`https://github.com/${OWNER}/${REPO}/releases/latest`);
    return;
  }
  // 맥: 코드 서명/공증이 없으면 무인 설치가 불가하므로, 받은 .dmg 를 열어
  // 사용자가 앱을 Applications 로 드래그해 교체하도록 안내한다(빈 화면/45초 폴백 없음).
  if (process.platform === 'darwin') {
    emit({ state: 'mac-manual' });
    shell.openPath(downloadedPath);
    return;
  }
  const installDir = path.dirname(process.execPath);
  // 앱 언어를 넘겨 설치 마법사(업데이트 모드)도 같은 언어로 표시되게 한다.
  const lang = (() => { try { return store.get('language') || 'ko'; } catch { return 'ko'; } })();
  spawn(downloadedPath, ['--update', '--dir', installDir, '--lang', lang], { detached: true, stdio: 'ignore' }).unref();
  // 예전엔 400ms 뒤 app.quit() 했지만, 그러면 인스톨러가 압축 해제/부팅되는 몇 초 동안
  // 화면이 비어 전환이 '느리게' 느껴졌다. 이제 앱 창을 그대로 둔 채 기다린다 →
  // 인스톨러가 준비되면 스스로 taskkill 로 이 앱을 종료시키므로, 인스톨러 창이 먼저
  // 뜨고 나서 이 앱이 닫혀 '빈 화면' 구간이 사라진다.
  // 만약 인스톨러가 끝내 시작되지 않으면(드묾) 창이 '설치 중'에서 멈춰 보이지 않도록,
  // 45초 뒤에도 이 앱이 살아 있으면(=인스톨러가 taskkill 하지 못함) 재시도 안내를 띄운다.
  // 정상 설치 시엔 그 전에 인스톨러가 이 앱을 종료시키므로 이 타이머는 실행되지 않는다.
  setTimeout(() => {
    emit({ state: 'error', message: '업데이트 설치 프로그램을 시작하지 못했습니다. 다시 시도해 주세요.' });
  }, 45000);
}

// 업데이트 기록(릴리스 목록)
async function getReleases() {
  if (!OWNER || OWNER === 'YOUR_GITHUB_USERNAME' || !REPO) return [];
  try {
    const beta = wantsBeta();
    const list = await ghGet(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=20`);
    if (!Array.isArray(list)) return [];
    return list
      // draft 는 항상 제외. Pre-release(베타)는 '베타 버전 받기'가 켜져 있을 때만 표시.
      .filter((r) => !r.draft && (beta || !r.prerelease))
      .map((r) => ({
        version: String(r.tag_name || r.name || '').replace(/^v/, ''),
        beta: !!r.prerelease,
        notes: (r.body || '').replace(/<!--(?!\s*i18n:)[\s\S]*?-->/g, '').trim(),
        date: (r.published_at || r.created_at || '').slice(0, 10),
        htmlUrl: r.html_url,
      }));
  } catch {
    return [];
  }
}

module.exports = { init, check, runInstaller, downloadAndInstall, getReleases };
