const { contextBridge, ipcRenderer } = require('electron');

// 렌더러(웹 UI)에 노출되는 안전한 API. window.stella 로 접근한다.
contextBridge.exposeInMainWorld('stella', {
  // 플랫폼('darwin' | 'win32' | ...) — macOS 는 네이티브 신호등 버튼을 쓰므로 UI 가 분기한다.
  platform: process.platform,

  // 멤버 상태
  getMembers: () => ipcRenderer.invoke('members:get'),
  refresh: () => ipcRenderer.invoke('members:refresh'),
  onMembers: (cb) => sub('members:update', cb),
  onPolling: (cb) => sub('members:polling', cb),
  onError: (cb) => sub('members:error', cb),
  onLive: (cb) => sub('members:live', cb),

  // 스케줄(뱅온 정보)
  getTodaySchedule: () => ipcRenderer.invoke('schedule:today'),
  getScheduleRange: (after, before) => ipcRenderer.invoke('schedule:range', { after, before }),
  getArtistSchedule: (key) => ipcRenderer.invoke('schedule:artist', key),

  // 설정
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  testNotification: () => ipcRenderer.invoke('notify:test'),

  // 방송 제목 번역(en/ja). { [원문]: 번역문 } 반환.
  translate: (texts, target) => ipcRenderer.invoke('i18n:translate', { texts, target }),

  // 외부 링크 / 창 제어
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  getWebCalUrl: () => ipcRenderer.invoke('app:webCalUrl'),
  getWebHomeUrl: () => ipcRenderer.invoke('app:webHomeUrl'),

  // 통합 설문
  getSurveyUrl: () => ipcRenderer.invoke('survey:url'),
  getSurveyStatus: () => ipcRenderer.invoke('survey:status'),
  dismissSurvey: () => ipcRenderer.invoke('survey:dismiss'),
  isSurveyDismissed: () => ipcRenderer.invoke('survey:dismissed'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximizeToggle: () => ipcRenderer.send('window:maximize-toggle'),
  close: () => ipcRenderer.send('window:close'),
  hide: () => ipcRenderer.send('window:hide'),
  onMaximized: (cb) => sub('window:maximized', cb),
  // 트레이 메뉴에서 설정(정보) 열기 신호
  onOpenSettings: (cb) => sub('open:settings', cb),
  // 트레이 메뉴에서 '업데이트 확인'(수동) 신호 — 정보 모달을 열고 체크한다
  onCheckUpdate: (cb) => sub('update:check-manual', cb),
  // 로그인 딥링크 복귀 — 시스템 브라우저 로그인 후 받은 app-finish 경로를 webview 로 이동시킨다
  onAuthFinish: (cb) => sub('auth:finish', cb),

  // 업데이트
  getVersion: () => ipcRenderer.invoke('app:version'),
  getChangelog: () => ipcRenderer.invoke('app:changelog'),
  getDiagnostics: () => ipcRenderer.invoke('app:diagnostics'),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  uninstall: () => ipcRenderer.invoke('app:uninstall'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb) => sub('update:status', cb),
});

function sub(channel, cb) {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
