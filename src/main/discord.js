// 디스코드 Rich Presence — 로컬 디스코드 클라이언트에 "스텔라리움에서 무엇을 보는 중"인지 표시한다.
//
//  - discord-rpc 로 디스코드 데스크톱 앱과 IPC 연결한다(디스코드가 안 떠 있으면 조용히 재시도).
//  - CLIENT_ID 는 디스코드 개발자 포털(https://discord.com/developers)에서 만든 Application ID.
//    비어 있으면 기능이 그냥 꺼진 채로 동작한다(에러 없음).
//  - 큰 아이콘은 그 포털의 Rich Presence → Art Assets 에 올린 이미지 키(LARGE_IMAGE)를 쓴다.
let RPC = null;
try { RPC = require('discord-rpc'); } catch { /* 미설치 시 비활성 */ }
const store = require('./store');

// 디스코드 Application ID(개발자 포털). 환경변수로도 덮어쓸 수 있다.
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1536003950627528825';
const LARGE_IMAGE = 'logo';          // 개발자 포털 Art Assets 에 올린 이미지 키
const LARGE_TEXT = '스텔라리움';

let client = null;
let ready = false;
let reconnectT = null;
let startTs = Date.now();
// last 는 현재 표시 상태. 영상처럼 리치한 경우 이미지/버튼까지 담는다.
let last = { details: '스텔라리움', state: '둘러보는 중', largeImageKey: LARGE_IMAGE, largeImageText: LARGE_TEXT };

function enabled() { try { return store.get('discordRpc') !== false; } catch { return true; } }
function available() { return !!RPC && !!CLIENT_ID; }

function scheduleReconnect() {
  if (reconnectT || !available() || !enabled()) return;
  reconnectT = setTimeout(() => { reconnectT = null; connect(); }, 15000);
}

function connect() {
  if (!available() || !enabled() || client) return;
  try {
    client = new RPC.Client({ transport: 'ipc' });
    client.on('ready', () => { ready = true; push(); });
    // 디스코드를 끄거나 연결이 끊기면 정리하고 잠시 뒤 재시도.
    client.on('disconnected', () => { ready = false; try { client && client.destroy(); } catch { /* ignore */ } client = null; scheduleReconnect(); });
    client.login({ clientId: CLIENT_ID }).catch(() => { client = null; scheduleReconnect(); });
  } catch { client = null; scheduleReconnect(); }
}

function push() {
  if (!client || !ready) return;
  const act = {
    details: (last.details || '스텔라리움').slice(0, 128),
    startTimestamp: startTs,
    largeImageKey: last.largeImageKey || LARGE_IMAGE,
    largeImageText: (last.largeImageText || LARGE_TEXT).slice(0, 128),
    instance: false,
  };
  if (last.state) act.state = String(last.state).slice(0, 128);
  // 영상 등 리치한 상태에서는 오른쪽 하단 작은 아이콘(로고)과 바로가기 버튼을 함께 표시한다.
  if (last.smallImageKey) { act.smallImageKey = last.smallImageKey; act.smallImageText = (last.smallImageText || LARGE_TEXT).slice(0, 128); }
  if (Array.isArray(last.buttons) && last.buttons.length) act.buttons = last.buttons.slice(0, 2);
  client.setActivity(act).catch(() => { /* 연결이 끊겼으면 무시(재연결이 처리) */ });
}

// 현재 보고 있는 것으로 상태 갱신. { details, state, largeImageKey?, largeImageText?, smallImageKey?, smallImageText?, buttons? }
function setPresence(p) {
  if (p && (p.details || p.state)) {
    last = {
      details: p.details || '스텔라리움',
      state: p.state || '',
      largeImageKey: p.largeImageKey || LARGE_IMAGE,
      largeImageText: p.largeImageText || LARGE_TEXT,
      smallImageKey: p.smallImageKey || '',
      smallImageText: p.smallImageText || '',
      buttons: Array.isArray(p.buttons) ? p.buttons : null,
    };
  }
  if (!enabled()) return;
  if (!client || !ready) { connect(); return; }
  push();
}

function clear() { try { client && client.clearActivity(); } catch { /* ignore */ } }

// 설정 토글. 켜면 연결+표시, 끄면 표시 지우고 연결 해제.
function setEnabled(on) {
  if (on) { startTs = Date.now(); connect(); setPresence(last); }
  else {
    clear();
    try { client && client.destroy(); } catch { /* ignore */ }
    client = null; ready = false;
    if (reconnectT) { clearTimeout(reconnectT); reconnectT = null; }
  }
}

function init() { if (available() && enabled()) connect(); }

module.exports = { init, setPresence, setEnabled, available };
