const Store = require('electron-store');
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// ── 설정 이관(1회) ────────────────────────────────────────
// 설정은 앱 설치 폴더가 아니라 OS 사용자 데이터 폴더(config.json)에 저장되므로
// 업데이트 시 유지된다. 다만 productName 을 '스텔라상태' → 'StellaStatus' 로 바꾸면서
// 사용자 데이터 폴더 이름이 달라졌다(구버전: .../스텔라상태, 신버전: .../StellaStatus).
// 구버전 설정이 그대로 넘어오도록, 신버전 config 가 아직 없으면 구버전 것을 복사한다.
try {
  const userData = app.getPath('userData'); // 신버전: .../StellaStatus
  const newCfg = path.join(userData, 'config.json');
  if (!fs.existsSync(newCfg)) {
    const oldCfg = path.join(path.dirname(userData), '스텔라상태', 'config.json');
    if (fs.existsSync(oldCfg)) {
      fs.mkdirSync(userData, { recursive: true });
      fs.copyFileSync(oldCfg, newCfg);
    }
  }
} catch { /* 이관 실패해도 기본값으로 진행 */ }

// 앱 설정 저장소. macOS: ~/Library/Application Support/StellaStatus/config.json,
// Windows: %APPDATA%/StellaStatus/config.json 에 보관된다.
const store = new Store({
  name: 'config',
  defaults: {
    // 앱 표시 언어: 'ko' | 'en' | 'ja'. (설치 프로그램/설정 화면에서 변경)
    language: 'ko',
    // 방송 상태 폴링 주기(초). 너무 짧게 두면 치지직/스텔라이트 서버에 부담이 되므로 하한 30초.
    pollIntervalSec: 60,
    // 윈도우 알림 사용 여부(방송 시작)
    notifyEnabled: true,
    // 방송 종료(방종) 알림 사용 여부
    notifyOffline: true,
    // 방송 시작 시 시스템 기본 웹브라우저로 자동 열기
    autoOpenLive: false,
    // 자동으로 브라우저를 열 멤버 채널 key 목록. null 이면 전체.
    autoOpenList: null,
    // 알림을 받을 멤버 채널 key 목록. null 이면 전체 구독.
    subscribed: null,
    // 창을 닫으면 트레이로 최소화(종료하지 않음)
    minimizeToTray: true,
    // 윈도우 시작 시 자동 실행
    launchAtStartup: false,
    // 시작 시 창을 숨긴 채(트레이) 실행
    startHidden: false,
    // 베타(Pre-release) 버전 받기. 켜면 정식+베타 중 가장 높은 버전을 우선 설치한다.
    betaChannel: false,
    // 카드 썸네일 표시
    showThumbnails: true,
    // 상단에 고정(즐겨찾기)한 멤버 채널 key 목록. 목록 맨 위로 정렬된다.
    pinned: [],
    // 마지막 창 크기/위치
    windowBounds: { width: 1180, height: 780 },
    // '이번 버전에서 바뀐 점'을 마지막으로 보여준 버전. 업데이트 후 첫 실행 때 딱 1번만 안내하는 데 쓴다.
    lastShownVersion: null,
    // 기본 화면: 'status'(기존 스텔라상태 UI) | 'stellarium'(스텔라리움 통합 홈). 서비스 초기 기본은 기존 UI.
    viewMode: 'status',
  },
});

module.exports = store;
