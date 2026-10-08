// 스텔라리움 webview 에 주입되는 브리지.
//  웹(stellarium.kr)이 '스텔라상태 앱 안'임을 알아차리고, 앱의 네이티브 설정
//  (방송 알림·브라우저 자동 열기 등)을 읽고 쓸 수 있게 window.stellaApp 를 노출한다.
//
//  보안: 우리 도메인(stellarium.kr / localhost)에서만 노출한다. webview 가 외부 사이트
//  (치지직 등)로 이동하면 브리지를 걸지 않는다.
const { contextBridge, ipcRenderer } = require('electron');

function allowedHost(h) {
  return h === 'stellarium.kr' || h.endsWith('.stellarium.kr') || h === 'localhost' || h === '127.0.0.1';
}

try {
  if (allowedHost(location.hostname)) {
    contextBridge.exposeInMainWorld('stellaApp', {
      isApp: true,
      // 앱 설정(전체) 읽기/부분 저장 — 채널은 메인에 이미 등록돼 있다.
      getSettings: () => ipcRenderer.invoke('settings:get'),
      setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
      // 멤버 로스터(알림/자동열기 대상 선택용) — key/slug/name/avatar 등.
      getMembers: () => ipcRenderer.invoke('members:get'),
      // 테스트 알림.
      testNotification: () => ipcRenderer.invoke('notify:test'),
    });
  }
} catch { /* 노출 실패해도 웹은 정상 동작 */ }
