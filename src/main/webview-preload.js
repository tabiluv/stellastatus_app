// 스텔라리움 webview 에 주입되는 브리지.
//  웹(stellarium.kr)이 '스텔라리움 앱 안'임을 알아차리고, 앱의 네이티브 설정
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
      // 알림 미러링 — 로그인된 계정의 새 알림(inbox 항목)을 앱이 네이티브 토스트로 띄우게 넘긴다.
      //  payload: { id, kind, title, body?, url?, slug? }.
      notify: (payload) => ipcRenderer.invoke('notify:fromWeb', payload),
      // 미러 활성 여부 통지 — 로그인되어 미러가 돌면 true(앱 자체 폴링 알림을 꺼 중복 방지).
      setMirrorActive: (active) => ipcRenderer.invoke('mirror:active', !!active),
      // 앱 업데이트 — /setting 에서 현재 버전 표시·확인·설치.
      getVersion: () => ipcRenderer.invoke('app:version'),
      checkUpdate: () => ipcRenderer.invoke('update:checkWeb'),
      installUpdate: () => ipcRenderer.invoke('update:install'),
    });

    // 앱 창 상단 좌측엔 창 신호등(닫기/최소화)이 떠 있다 — 웹의 공지·로고·nav 가 그 아래로
    //  가리지 않도록 상단을 살짝 내린다. 웹 코드는 건드리지 않고(=일반 브라우저는 그대로),
    //  앱 webview 에만 이 스타일을 주입한다. (sticky 헤더 .site-header 도 같은 높이로 내림)
    const injectTopInset = () => {
      try {
        if (document.getElementById('stella-app-inset')) return;
        const st = document.createElement('style');
        st.id = 'stella-app-inset';
        st.textContent = 'body{padding-top:30px !important}.site-header{top:30px !important}';
        (document.head || document.documentElement).appendChild(st);
      } catch { /* ignore */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectTopInset);
    else injectTopInset();
  }
} catch { /* 노출 실패해도 웹은 정상 동작 */ }
