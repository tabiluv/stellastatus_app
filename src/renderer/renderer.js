/* 스텔라상태 — 렌더러 UI 로직 */
(() => {
  const api = window.stella;
  const I18N = window.I18N;
  const T = (k, p) => I18N.t(k, p); // 번역 단축 함수

  // 플랫폼별 UI 분기용 속성(예: macOS 는 네이티브 신호등 버튼 → 커스텀 창 버튼 숨김)
  document.documentElement.setAttribute('data-platform', api.platform || 'unknown');

  const state = {
    members: [],
    settings: {},
    filter: 'all',
    search: '',
    manualUpdateCheck: false,
    scheduleItems: null,
    updateInfo: null,
    updateSnoozed: false, // [나중에] 누르면 이번 실행 동안 자동 알림을 숨긴다(완전 재시작 시 초기화)
    installing: false,    // [설치하기] 눌러 다운로드/설치가 진행 중인지
    visibleKeys: new Set(),
    thumbStamp: 0, // 폴링 갱신 시각 — 라이브 썸네일 캐시 무효화용(아래 bustThumb 참고)
  };

  const $ = (sel) => document.querySelector(sel);
  const grid = $('#memberScroll');

  // 방송 제목 번역 — data-tt(원문)가 붙은 요소를 현재 언어로 번역해 표시한다.
  //  ko: 원문 그대로. en/ja: 메인 프로세스(번역 API)로 번역 후 적용. 캐시로 깜빡임 최소화.
  //  번역이 아직 안 온 항목은 원문(한국어)을 그대로 두지 않고 로딩 스피너를 보여준다(번역 중임을 표시).
  const ttCache = { en: new Map(), ja: new Map() };
  const ttPending = { en: new Set(), ja: new Set() }; // 번역 진행 중인 원문(중복 요청 방지)
  let _ttSeq = 0;
  // 일시적 실패(구글 rate-limit 등)로 아직 번역 안 된 항목을 자동으로 다시 시도한다.
  // '진전 없는 라운드'가 연속으로 상한(4회)에 닿으면 포기한다(무한 반복 방지).
  const ttRetryN = { en: 0, ja: 0 };
  const ttRetryTimer = { en: null, ja: null };
  function scheduleTtRetry(target) {
    if (ttRetryTimer[target]) return;         // 이미 예약됨
    if ((ttRetryN[target] || 0) >= 4) return;  // 상한 도달 → 포기
    ttRetryTimer[target] = setTimeout(() => {
      ttRetryTimer[target] = null;
      if (I18N.lang === target) translateTitles();
    }, 1200 * Math.max(1, ttRetryN[target])); // 점점 늘어나는 간격(1.2s, 2.4s, …)
  }
  const TT_SPIN = '<span class="tt-spin" role="status" aria-label="translating"></span>';
  // 번역 텍스트 적용(중복 DOM 쓰기 방지). ttState 로 현재 상태를 기억한다.
  // 텍스트가 실제로 바뀌면, 마퀴가 걸린 스케줄 제목(.stt)은 새 텍스트 폭으로 마퀴를 다시 계산한다.
  function ttSetText(e, text) {
    if (e.dataset.ttState === 'text' && e.textContent === text) return;
    e.dataset.ttState = 'text';
    e.textContent = text;
    if (e.classList.contains('stt')) { const box = e.closest('.sched-title'); if (box) applyMarquee(box); }
  }
  // 로딩 스피너 표시(이미 로딩 중이면 그대로 둠)
  function ttSetLoading(e) {
    if (e.dataset.ttState === 'loading') return;
    e.dataset.ttState = 'loading';
    e.innerHTML = TT_SPIN;
  }
  async function translateTitles() {
    const target = I18N.lang;
    const cache = ttCache[target];
    const els = [...document.querySelectorAll('[data-tt]')];
    if (!els.length) return;
    // ko(또는 미지원 언어): 항상 원문 그대로, 로딩 표시 없음.
    if (!cache) { els.forEach((e) => ttSetText(e, e.dataset.tt)); return; }
    // 캐시된 건 즉시 번역 적용, 아직 없는 건 로딩 스피너 표시.
    const need = [];
    els.forEach((e) => {
      const c = cache.get(e.dataset.tt);
      if (c != null) ttSetText(e, c);
      else { ttSetLoading(e); need.push(e.dataset.tt); }
    });
    // 이미 요청 중인 항목은 제외한다(중복 네트워크 요청 방지). 진행 중 요청이 끝나면
    // 문서 전체를 다시 훑어 이 요소들도 함께 갱신되므로, 지금 새로 요청하지 않아도 된다.
    const pending = ttPending[target];
    const uniq = [...new Set(need)].filter((k) => !pending.has(k));
    if (!uniq.length) return;
    uniq.forEach((k) => pending.add(k));
    const seq = ++_ttSeq;
    let map = {};
    try {
      map = await api.translate(uniq, target);
    } catch {
      // 실패: 스피너가 멈춘 채 남지 않도록 로딩 중이던 항목을 원문으로 되돌린다.
      if (I18N.lang === target) document.querySelectorAll('[data-tt]').forEach((e) => { if (!cache.has(e.dataset.tt)) ttSetText(e, e.dataset.tt); });
      return;
    } finally {
      uniq.forEach((k) => pending.delete(k));
    }
    const before = cache.size;
    Object.entries(map).forEach(([k, v]) => v && cache.set(k, v));
    const gained = cache.size - before; // 이번에 새로 번역된 개수
    if (seq !== _ttSeq || I18N.lang !== target) return; // 그 사이 언어/화면 바뀌면 폐기
    document.querySelectorAll('[data-tt]').forEach((e) => {
      const c = cache.get(e.dataset.tt);
      ttSetText(e, c != null ? c : e.dataset.tt); // 번역 결과에 없으면 원문 유지(스피너 제거)
    });
    // 아직 번역 안 된 항목이 남았으면 자동 재시도. 진전이 있었으면 재시도 예산을 리셋한다.
    const stillNeed = [...document.querySelectorAll('[data-tt]')].some((e) => !cache.has(e.dataset.tt));
    if (stillNeed) { if (gained > 0) ttRetryN[target] = 0; ttRetryN[target] = (ttRetryN[target] || 0) + 1; scheduleTtRetry(target); }
    else ttRetryN[target] = 0;
  }

  // ── 아이콘 팩(Lucide, MIT) ───────────────────
  const ICONS = {
    refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    minus: '<path d="M5 12h14"/>',
    square: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    check: '<path d="M21.8 10A10 10 0 1 1 17 3.3"/><path d="m9 11 3 3L22 4"/>',
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    checkmark: '<path d="M20 6 9 17l-5-5"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    // 소셜 브랜드 아이콘 — 각 브랜드 공식 로고(Simple Icons). 모두 채움(fill) 방식.
    youtube: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
    xlogo: '<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>',
    instagram: '<path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/>',
  };
  // CHZZK 공식 심볼(아이콘, 브랜드 그린). 이름 없는 로고 마크만 사용한다. 브랜드 가이드상 형태·색은 변형하지 않는다.
  const CHZZK_LOGO = '<svg viewBox="0 0 32 32" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M24.106 24.664v-4.782H16.92l7.911-10.915h-6.41l1.94-2.678h-6.41L8.653 13.6h6.41l-8.02 11.065h17.063Z"/></svg>';
  // fill 로 그리는 아이콘.
  const FILLED = new Set(['play', 'youtube', 'xlogo', 'instagram']);
  function icon(name, size = 18) {
    const p = ICONS[name];
    if (!p) return '';
    const attrs = FILLED.has(name)
      ? 'fill="currentColor" stroke="none"'
      : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${attrs}>${p}</svg>`;
  }
  function setIcon(sel, name, size) {
    const el = $(sel);
    if (el) el.innerHTML = icon(name, size);
  }

  // ── 유틸 ────────────────────────────────────
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 오류 메시지를 '복사 가능한' 형태로 렌더한다 — 텍스트 선택 허용(전역 user-select:none 예외) + 복사 버튼.
  // detail(실제 오류 원문)이 있으면 그대로 붙여넣어 신고할 수 있게 함께 보여준다.
  function errorBoxHtml(message, detail) {
    const full = detail ? `${message}\n${detail}` : String(message || '');
    return `<div class="err-box"><span class="err-text">${esc(message)}</span>`
      + (detail ? `<code class="err-detail">${esc(detail)}</code>` : '')
      + `<button class="err-copy" type="button" data-copy="${esc(full)}">${icon('copy', 13)}<span>${esc(T('err.copy'))}</span></button></div>`;
  }
  const isPinned = (key) => (state.settings.pinned || []).includes(key);
  const nfmt = (n) => (n == null ? '' : Number(n).toLocaleString('ko-KR'));
  const openLink = (url) => url && api.openExternal(url);

  // 강조색이 밝으면 어두운 글자, 어두우면 흰 글자
  function inkFor(hex) {
    const c = String(hex || '').replace('#', '');
    if (c.length < 6) return '#fff';
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return L > 0.62 ? '#1c1720' : '#ffffff';
  }

  // 시각 파싱(KST 고정) — 치지직/StelLight 값은 타임존 표기가 없는 한국 시각(UTC+9)이므로
  // PC 시간대와 무관하게 KST 벽시계로 해석해 절대시간(UTC ms)으로 변환한다.
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  function parseOpen(d) {
    if (!d) return null;
    const s = String(d).trim();
    // 이미 타임존(Z 또는 +hh:mm)이 있으면 그대로 절대시간으로 파싱
    if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
      const ms = Date.parse(s.replace(' ', 'T'));
      return Number.isNaN(ms) ? null : ms;
    }
    const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (!m) { const ms = Date.parse(s.replace(' ', 'T')); return Number.isNaN(ms) ? null : ms; }
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - KST_OFFSET;
  }
  function fmtUptime(openMs) {
    if (!openMs) return '';
    const diff = Date.now() - openMs;
    if (diff < 0) return '';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return T('up.just');
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? T('up.hm', { h, m }) : T('up.m', { m });
  }

  // 간단 마크다운 → HTML (릴리스 노트용). 입력은 먼저 이스케이프하여 XSS 방지.
  function mdToHtml(src) {
    const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let list = null;
    let quote = false; // 인용구(>) 진행 중 여부
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    const closeQuote = () => { if (quote) { out.push('</blockquote>'); quote = false; } };
    const inline = (t) => {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, txt, url) => `<a class="md-link" data-url="${esc(url)}">${txt}</a>`);
      return t;
    };
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) { closeList(); closeQuote(); continue; }
      let m;
      // 인용구(>): 연속된 > 줄은 하나의 blockquote 로 묶고, 줄바꿈은 <br> 로 이어붙인다.
      if ((m = /^>\s?(.*)/.exec(line))) {
        closeList();
        if (!quote) { out.push('<blockquote>'); quote = true; } else { out.push('<br>'); }
        out.push(inline(m[1]));
        continue;
      }
      closeQuote(); // 인용구가 아닌 줄을 만나면 blockquote 를 닫는다
      if ((m = /^###\s+(.*)/.exec(line))) { closeList(); out.push(`<h4>${inline(m[1])}</h4>`); continue; }
      if ((m = /^##\s+(.*)/.exec(line))) { closeList(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
      if ((m = /^#\s+(.*)/.exec(line))) { closeList(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
      if (/^(-{3,}|={3,})$/.test(line)) { closeList(); out.push('<hr>'); continue; }
      if ((m = /^\s*[-*]\s+(.*)/.exec(line))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
      if ((m = /^\s*\d+\.\s+(.*)/.exec(line))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
    closeList();
    closeQuote();
    return out.join('');
  }

  // 릴리스 노트가 3개 국어로 작성된 경우 현재 언어 구획만 뽑아낸다.
  //  마커 규칙: 본문에 아래 HTML 주석으로 언어 구획을 나눈다.
  //    <!-- i18n:ko --> …한국어… <!-- i18n:en --> …English… <!-- i18n:ja --> …日本語…
  //  마커가 없으면(구버전 노트) 원문을 그대로 사용한다.
  function localizeNotes(md) {
    const src = String(md || '');
    if (!/<!--\s*i18n:(ko|en|ja)\s*-->/i.test(src)) return src;
    const re = /<!--\s*i18n:(ko|en|ja)\s*-->/gi;
    const parts = {};
    let m, last = null, lastIdx = 0;
    while ((m = re.exec(src))) {
      if (last) parts[last] = src.slice(lastIdx, m.index).trim();
      last = m[1].toLowerCase();
      lastIdx = re.lastIndex;
    }
    if (last) parts[last] = src.slice(lastIdx).trim();
    return parts[I18N.lang] || parts.ko || parts.en || parts.ja || src;
  }

  // CSP(script-src 'self')에서 인라인 onerror 가 막히므로 폴백은 JS 로 연결한다.
  function wireImgFallback(img, fallback) {
    img.addEventListener('error', function handler() {
      img.removeEventListener('error', handler);
      if (fallback) img.src = fallback;
      else img.style.display = 'none';
    });
  }

  // ── 멤버 카드 렌더 ───────────────────────────
  // 치지직 라이브 썸네일은 방송이 진행돼도 URL 문자열이 그대로라, 브라우저 캐시 때문에
  // 처음 받은 이미지에서 '정지'된 것처럼 보인다. 폴링 갱신 시각(thumbStamp)을 쿼리로 붙여
  // 매 갱신마다 이미지를 새로 받아오게 한다. (필터/검색/언어 변경 등 같은 폴링 내 리렌더에서는
  //  stamp 가 그대로라 불필요한 재요청/깜빡임이 없다.)
  function bustThumb(url) {
    if (!url) return url;
    return url + (url.includes('?') ? '&' : '?') + '_=' + (state.thumbStamp || 0);
  }

  function memberCard(m) {
    const card = document.createElement('article');
    card.className = 'card' + (m.isLive ? ' live' : '') + (isPinned(m.key) ? ' pinned' : '');
    card.dataset.key = m.key;
    card.style.setProperty('--card-accent', m.accent);
    card.style.setProperty('--card-accent2', m.accent2);
    card.style.setProperty('--card-ink', inkFor(m.accent));

    const showThumb = state.settings.showThumbnails !== false;
    const liveThumb = m.isLive && showThumb && m.thumbnail;

    // 오프라인/썸네일 끔: 멤버 로고(로컬 → 치지직 → 별)
    const logoInner = `<img class="mlogo" src="assets/logos/${esc(m.logo || m.key)}.png" alt="">`;
    const thumb = liveThumb
      ? `<img class="mthumb" src="${esc(bustThumb(m.thumbnail))}" alt="">`
      : `<div class="thumb-logo">${logoInner}</div>`;

    const openMs = m.isLive ? parseOpen(m.openDate) : null;
    const badge = m.isLive
      ? `<span class="live-badge"><span class="b-dot"></span>LIVE</span>
         ${m.viewerCount != null ? `<span class="viewers">${icon('eye', 13)} ${nfmt(m.viewerCount)}</span>` : ''}
         ${openMs ? `<span class="live-elapsed" data-open="${openMs}">${icon('clock', 12)} ${esc(fmtUptime(openMs))}</span>` : ''}`
      : `<span class="offline-tag">OFFLINE</span>`;

    const avatar = m.avatar
      ? `<img class="avatar mava" src="${esc(m.avatar)}" alt="">`
      : `<img class="avatar star-mark" src="assets/logo_star.png" alt="">`;

    const titleHtml = m.isLive
      ? `<div class="m-title"${m.title ? ` data-tt="${esc(m.title)}"` : ''}>${esc(m.title || T('card.liveDefault'))}</div>
         <div class="m-category"${m.category ? ` data-tt="${esc(m.category)}"` : ''}>${esc(m.category || '')}</div>`
      : `<div class="m-title offline">${m.error ? T('card.offErr') : T('card.offIdle')}</div>
         <div class="m-category"></div>`;

    // 소셜 링크(있는 것만) — 프로필을 누르면 이름이 블러되며 오른쪽으로 아이콘이 차례로 튀어나온다.
    const SOCIALS = [
      { k: 'chzzk', svg: CHZZK_LOGO, url: m.social && m.social.chzzk },
      { k: 'youtube', svg: icon('youtube', 16), url: m.social && m.social.youtube },
      { k: 'x', svg: icon('xlogo', 14), url: m.social && m.social.x },
      { k: 'instagram', svg: icon('instagram', 16), url: m.social && m.social.instagram },
    ].filter((s) => s.url);
    const socialHtml = SOCIALS.length
      ? `<div class="social-icons" style="--n:${SOCIALS.length}">${SOCIALS.map((s, i) =>
          `<button class="social-ico s-${s.k}" data-url="${esc(s.url)}" style="--i:${i}" title="${s.k}" aria-label="${s.k}">${s.svg}</button>`).join('')}</div>`
      : '';

    const pinTip = esc(isPinned(m.key) ? T('card.unpin') : T('card.pin'));
    card.innerHTML = `
      <div class="thumb-wrap">${thumb}${badge}<button class="pin-btn${isPinned(m.key) ? ' on' : ''}" data-pin="${esc(m.key)}" title="${pinTip}" aria-label="${pinTip}">${icon('star', 15)}</button></div>
      <div class="card-body">
        <div class="member-head${SOCIALS.length ? ' has-social' : ''}">
          <div class="ava-wrap${SOCIALS.length ? ' clickable' : ''}" role="button" tabindex="0" aria-label="${esc(T('card.social'))}">${avatar}</div>
          <div class="m-names">
            <div class="m-name">${esc(I18N.memberName(m))} <span class="gen-chip">${esc(I18N.genName(m.gen, m.genName))}</span></div>
            <div class="m-eng">${esc(I18N.lang === 'ko' ? (m.nameEng || '') : (m.name || ''))}</div>
          </div>
          ${socialHtml}
        </div>
        ${titleHtml}
        <div class="card-actions">
          <button class="btn btn-live ${m.isLive ? '' : 'disabled'}" data-url="${esc(m.liveUrl)}">
            ${m.isLive ? icon('play', 15) + ' ' + T('card.go') : T('card.wait')}
          </button>
          <button class="btn btn-ch" data-url="${esc(m.channelUrl || m.liveUrl)}" title="${esc(T('card.channel'))}" aria-label="${esc(T('card.channel'))}">${icon('external', 17)}</button>
        </div>
      </div>`;

    // 이미지 폴백 연결(CSP 대응)
    const mlogo = card.querySelector('.mlogo');
    if (mlogo) wireImgFallback(mlogo, m.avatar || 'assets/logo_star.png');
    const mava = card.querySelector('.mava');
    if (mava) wireImgFallback(mava, 'assets/logo_star.png');
    const mthumb = card.querySelector('.mthumb');
    if (mthumb) wireImgFallback(mthumb, null);

    card.querySelectorAll('[data-url]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!b.classList.contains('disabled')) openLink(b.dataset.url);
      });
    });
    const pinBtn = card.querySelector('[data-pin]');
    if (pinBtn) pinBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePin(m.key); });

    // 프로필(아바타) 클릭 → 이름 블러 + 소셜 아이콘 팝아웃 토글
    if (SOCIALS.length) {
      const head = card.querySelector('.member-head');
      const avaWrap = card.querySelector('.ava-wrap');
      const toggle = (e) => { e.stopPropagation(); head.classList.toggle('social-open'); };
      if (avaWrap) {
        avaWrap.addEventListener('click', toggle);
        avaWrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
      }
    }
    return card;
  }

  // 고정 토글 → 설정 저장 후 재정렬(애니메이션)
  async function togglePin(key) {
    const set = new Set(state.settings.pinned || []);
    set.has(key) ? set.delete(key) : set.add(key);
    state.settings = await api.setSettings({ pinned: [...set] });
    render(true);
    renderSchedule(true); // 오늘의 뱅온도 즐겨찾기 반영해 재정렬
  }

  // 검색어/이름 정규화: 소문자화 + 카타카나→히라가나 통일 + 공백 제거.
  // 히라가나로만 입력해도 카타카나가 섞인 이름(예: 純角ユニ, 独음 あやつのゆに)이 매칭된다.
  function kana(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/\s+/g, '');
  }

  function applyFilter(list) {
    let out = list;
    if (state.filter === 'live') out = out.filter((m) => m.isLive);
    else if (state.filter === 'gen1') out = out.filter((m) => m.gen === 1);
    else if (state.filter === 'gen2') out = out.filter((m) => m.gen === 2);
    else if (state.filter === 'gen3') out = out.filter((m) => m.gen === 3);
    if (state.search) {
      // 한국어(name)·영어(nameEng)·일본어(nameJa)·히라가나 독음(nameJaKana)을 모두 대상으로 검색한다.
      // (현재 UI 언어와 무관하게 어떤 표기로 입력해도 찾을 수 있도록 여러 필드를 함께 본다)
      // kana(): 카타카나를 히라가나로 통일해, 히라가나로만 입력해도 카타카나 이름(예: ユニ)이 매칭되게 한다.
      const q = kana(state.search);
      out = out.filter((m) =>
        kana(m.name).includes(q)
        || kana(m.nameEng).includes(q)
        || kana(m.nameJa).includes(q)
        || kana(m.nameJaKana).includes(q)
      );
    }
    // 고정(즐겨찾기) 최상단 → 방송 중 → 기수(로스터) 순
    const pr = (m) => (isPinned(m.key) ? 0 : 1);
    const ord = (m) => (m.order != null ? m.order : (m.gen || 9) * 100);
    return [...out].sort((a, b) => pr(a) - pr(b) || Number(b.isLive) - Number(a.isLive) || ord(a) - ord(b));
  }

  function render(animate = false) {
    // 폴링 등 일반 갱신은 전체 다시 그림(애니메이션 없음)
    if (!animate) { renderNow(false); return; }

    // 필터/탭 전환: 남는 카드는 FLIP 으로 새 자리로 '슬라이드', 나가는 카드만 퇴장,
    // 새로 들어오는 카드만 등장 애니메이션. (카드가 순간이동하거나 위에 겹쳐 보이던 문제 해결)
    const list = applyFilter(state.members);
    const newKeySet = new Set(list.map((m) => m.key));
    const cards = [...grid.querySelectorAll('.card')];
    const existing = new Map(cards.filter((c) => !c.classList.contains('leave')).map((c) => [c.dataset.key, c]));

    // FIRST: 계속 남을 카드들의 현재 화면 위치를 먼저 기록한다(레이아웃을 바꾸기 전에).
    const firstRects = new Map();
    existing.forEach((c, key) => { if (newKeySet.has(key)) firstRects.set(key, c.getBoundingClientRect()); });

    // 1) 나가는 카드: 현재 위치에 absolute 로 고정해 레이아웃에서 빼고(남는 카드가 자리를 메움),
    //    남는/새 카드보다 '아래' 레이어(z-index:0)에서 페이드아웃 → 위에 덮어씌워지는 현상 방지.
    grid.style.position = 'relative';
    const leaving = cards.filter((c) => !newKeySet.has(c.dataset.key) && !c.classList.contains('leave'));
    const leaveRects = leaving.map((c) => ({ c, top: c.offsetTop, left: c.offsetLeft, w: c.offsetWidth }));
    leaveRects.forEach(({ c, top, left, w }) => {
      c.style.width = w + 'px';
      c.style.position = 'absolute';
      c.style.top = top + 'px';
      c.style.left = left + 'px';
      c.style.margin = '0';
      c.style.zIndex = '0';
      c.style.pointerEvents = 'none';
      c.classList.add('leave');
      const done = () => c.remove();
      c.addEventListener('animationend', done, { once: true });
      setTimeout(done, 320);
    });

    // 2) 남는 카드는 그대로, 새 카드만 등장 애니메이션으로 생성 → 순서대로 재배치
    let anim = 0;
    const ordered = list.map((m) => {
      const ex = existing.get(m.key);
      if (ex) {
        // 그대로 남는 카드: 등장 애니메이션 잔재 제거(재배치 시 다시 실행되는 것 방지)
        ex.classList.remove('enter');
        ex.style.animationDelay = '';
        // 고정(즐겨찾기) 상태 변화를 재사용 카드에도 반영
        const on = isPinned(m.key);
        ex.classList.toggle('pinned', on);
        const pb = ex.querySelector('.pin-btn');
        if (pb) {
          pb.classList.toggle('on', on);
          const tip = on ? T('card.unpin') : T('card.pin');
          pb.title = tip; pb.setAttribute('aria-label', tip);
        }
        return ex;
      }
      const c = memberCard(m);
      c.classList.add('enter');
      c.style.zIndex = '1'; // 나가는 카드(z-index:0) 위에서 등장
      c.style.animationDelay = Math.min(anim++ * 0.03, 0.22) + 's';
      // 등장이 끝나면 enter 클래스 제거 → 이후 재배치돼도 다시 애니메이션되지 않음
      const onEnd = (e) => {
        if (e.animationName !== 'card-in') return;
        c.classList.remove('enter');
        c.style.animationDelay = '';
        c.style.zIndex = '';
        c.removeEventListener('animationend', onEnd);
      };
      c.addEventListener('animationend', onEnd);
      return c;
    });
    ordered.forEach((c) => grid.appendChild(c));

    // 3) 빈 결과 처리
    const emptyEl = grid.querySelector('.empty-state');
    if (!list.length) {
      if (!emptyEl) {
        const e = document.createElement('div');
        e.className = 'empty-state';
        e.textContent = state.members.length ? T('empty.noMatch') : T('empty.loading');
        grid.appendChild(e);
      }
    } else if (emptyEl) {
      emptyEl.remove();
    }

    // 4) FLIP — 남는 카드를 옛 위치에서 새 위치로 부드럽게 이동. (측정/역변환/재생을 분리해
    //    레이아웃 스래싱을 피하고, 단일 리플로우로 전환을 확실히 트리거한다.)
    // LAST: 새 위치를 먼저 모두 읽는다(읽기만).
    const lastRects = new Map();
    firstRects.forEach((_first, key) => {
      const c = existing.get(key);
      if (c && c.isConnected) lastRects.set(key, c.getBoundingClientRect());
    });
    // INVERT: 옛 자리로 되돌려 놓는다(쓰기만).
    const movers = [];
    firstRects.forEach((first, key) => {
      const last = lastRects.get(key);
      const c = existing.get(key);
      if (!last || !c) return;
      const dx = Math.round(first.left - last.left);
      const dy = Math.round(first.top - last.top);
      if (!dx && !dy) return; // 자리 안 바뀐 카드는 건너뜀
      c.style.zIndex = '1'; // 나가는 카드(z-index:0) 위로
      c.style.transition = 'none';
      c.style.transform = `translate(${dx}px, ${dy}px)`;
      c.style.willChange = 'transform';
      movers.push(c);
    });
    // PLAY: 한 번의 리플로우로 역변환을 확정한 뒤, 새 자리로 애니메이션.
    if (movers.length) {
      void grid.offsetWidth; // 강제 리플로우 1회
      movers.forEach((c) => {
        c.style.transition = 'transform .34s cubic-bezier(.2,.8,.2,1)';
        c.style.transform = 'none';
        const clear = (e) => {
          if (e.propertyName !== 'transform') return;
          c.style.transition = '';
          c.style.transform = '';
          c.style.willChange = '';
          c.style.zIndex = '';
          c.removeEventListener('transitionend', clear);
        };
        c.addEventListener('transitionend', clear);
      });
    }

    state.visibleKeys = newKeySet;
    updateSummary();
    translateTitles();
  }

  function renderNow(animate = false) {
    const list = applyFilter(state.members);
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state">${state.members.length ? esc(T('empty.noMatch')) : esc(T('empty.loading'))}</div>`;
    } else {
      const frag = document.createDocumentFragment();
      let anim = 0; // 새로 나타나는 카드만 순차 애니메이션(그대로 있는 카드는 그대로)
      list.forEach((m) => {
        const c = memberCard(m);
        if (animate && !state.visibleKeys.has(m.key)) {
          c.classList.add('enter');
          c.style.animationDelay = Math.min(anim++ * 0.03, 0.22) + 's';
        }
        frag.appendChild(c);
      });
      grid.appendChild(frag);
    }
    state.visibleKeys = new Set(list.map((m) => m.key));
    updateSummary();
    translateTitles();
  }

  function updateSummary() {
    const live = state.members.filter((m) => m.isLive);
    const el = $('#liveSummaryText');
    if (!state.members.length) el.textContent = T('summary.loading');
    else if (live.length) el.innerHTML = T('summary.live', { n: live.length });
    else el.textContent = T('summary.none');
  }

  // ── 인앱 토스트(위→아래 플로팅) ───────────────
  function showToast({ icon: ic, avatar, accent, title, desc, actionLabel, onAction, onClose, className, url, duration = 5000, spin = false }) {
    const host = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast' + (className ? ' ' + className : '');
    if (accent) t.style.setProperty('--toast-accent', accent);
    const media = avatar
      ? `<img class="t-ava" src="${esc(avatar)}" alt="">`
      : `<div class="t-ico">${icon(ic || 'bell', 18)}</div>`;
    t.innerHTML = `
      ${media}
      <div class="t-body">
        <div class="t-title">${esc(title)}</div>
        ${desc ? `<div class="t-desc">${esc(desc)}</div>` : ''}
      </div>
      ${actionLabel ? `<button class="mini-btn t-act">${esc(actionLabel)}</button>` : ''}
      <button class="t-close" aria-label="${esc(T('tb.close'))}">${icon('x', 15)}</button>`;

    const ava = t.querySelector('.t-ava');
    if (ava) wireImgFallback(ava, 'assets/logo_star.png');

    let closed = false;
    let acted = false;
    const close = () => {
      if (closed) return; closed = true;
      if (!acted) onClose && onClose(); // 설치(action)로 닫힌 게 아니라 직접 닫힘 → dismiss 콜백
      t.classList.add('closing'); // 높이/여백 접기 + 페이드 → 아래 토스트가 부드럽게 올라옴
      setTimeout(() => t.remove(), 340);
    };
    t.querySelector('.t-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
    const act = t.querySelector('.t-act');
    if (act) act.addEventListener('click', (e) => { e.stopPropagation(); acted = true; onAction && onAction(); close(); });
    if (url) t.addEventListener('click', () => { openLink(url); close(); });

    if (spin) t.querySelector('.t-ico svg')?.classList.add('spin');

    host.appendChild(t);
    void t.offsetHeight; // 강제 리플로우로 진입 애니메이션 보장
    t.classList.add('show');
    if (duration > 0) setTimeout(close, duration);
    return close;
  }

  // ── 스케줄(뱅온) — StelLight 요청은 시작 시 1회, 표시는 라이브 상태에 맞춰 갱신 ──
  const timeLabel = (dt) => { const m = /T(\d{2}):(\d{2})/.exec(dt || ''); return m ? `${m[1]}:${m[2]}` : ''; };
  const isRest = (title) => /휴방/.test(title || '');

  // 스케줄 항목에 해당하는 멤버 객체 찾기(채널 key → 한국어 이름 순)
  function scheduleMember(it) {
    return (
      state.members.find((x) => x.key && x.key === it.channelKey) ||
      state.members.find((x) => x.name === it.stellarName) ||
      null
    );
  }
  // 스케줄 항목의 멤버가 현재 방송 중인지
  function scheduleMemberLive(it) {
    const m = scheduleMember(it);
    return m ? m.isLive : false;
  }
  // 스케줄에 표시할 멤버 이름(언어별). 매칭 실패 시 원본(한국어) 유지.
  function schedName(it) {
    const m = scheduleMember(it);
    return m ? I18N.memberName(m) : (it.stellarName || '');
  }

  // KST 기준 날짜 문자열(YYYY-MM-DD). 라이브러리가 날짜 경계를 PC 로컬 시간으로
  // 계산해 어제 항목이 섞여 들어오는 것을 막기 위해, 항상 'KST 오늘'만 남긴다.
  function kstDateStr(ms) {
    const d = new Date(ms + KST_OFFSET);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }

  async function loadSchedule() {
    const data = await api.getTodaySchedule();
    if (data && data.error) { state.scheduleItems = 'error'; state.scheduleError = String(data.error); renderSchedule(true); return; }
    state.scheduleError = '';
    let items = Array.isArray(data) ? data : [];
    const today = kstDateStr(Date.now());
    const yesterday = kstDateStr(Date.now() - 86400000);
    state.scheduleItems = items
      .filter((it) => {
        if (/강지/.test(it.stellarName || '')) return false; // 스텔라이브 멤버 아님
        const ms = parseOpen(it.startDateTime);
        if (ms == null) return true; // 시간 없는 항목(휴방 등)은 오늘 것으로 유지
        const d = kstDateStr(ms);
        if (d === today) return true;
        // 어제 시작한 '방송'(휴방 제외): '지금 라이브인 멤버'만 오늘로 이월해 보여준다.
        // 방송중이지 않은 멤버의 어제 일정은 다음날로 넘어간 것으로 보고 오늘의 뱅온에서 제외한다.
        if (d === yesterday && !isRest(it.title)) { const mem = scheduleMember(it); return !!(mem && mem.isLive); }
        return false;
      })
      .map((it) => {
        const ms = parseOpen(it.startDateTime);
        if (ms == null || isRest(it.title)) return it;
        const d = kstDateStr(ms);
        const kstHour = new Date(ms + KST_OFFSET).getUTCHours();
        // 밤샘/이월 방송으로 취급: 어제 시작분, 또는 오늘 '새벽(6시 이전)' 시작분.
        const overnight = d === yesterday || (d === today && kstHour < 6);
        if (!overnight) return it;
        // 이월(_carry) 처리는 '지금 라이브인 멤버'에게만 적용한다. 방송중이지 않은 멤버는
        // 이월 처리를 걸지 않아, 오늘 새벽 일정도 숨기지 않고 일반 '오늘' 항목으로 그대로 표시한다.
        const mem = scheduleMember(it);
        if (!(mem && mem.isLive)) return it;
        return { ...it, _carry: true, _fromYesterday: d === yesterday };
      });
    renderSchedule(true);
  }

  // 뱅온을 '멤버별'로 묶어 분류한다. (한 멤버가 휴방+스페이스처럼 여러 개면 하나로 합치고,
  //  일정이 없는 멤버는 '정보 없음'으로 표시한다.)
  function classifyScheduleRows() {
    const items = state.scheduleItems;
    if (!Array.isArray(items)) return null;
    const now = Date.now();

    // 로스터의 모든 멤버를 먼저 등록(일정 없는 멤버도 '정보 없음'으로 나오게).
    const groups = new Map(); // key -> { m, name, key, items }
    state.members.forEach((m) => groups.set(m.key, { m, name: I18N.memberName(m), key: m.key, items: [] }));
    // 오늘자 '방송'(휴방 아님)이 있는 멤버 — 이런 멤버는 어제 이월분을 굳이 겹쳐 보이지 않는다.
    const hasTodayLive = new Set();
    items.forEach((it) => { if (!it._carry && !isRest(it.title)) { const mm = scheduleMember(it); if (mm) hasTodayLive.add(mm.key); } });
    items.forEach((it) => {
      // 어제 시작 항목(_carry): 그 멤버가 지금 라이브(방송이 오늘까지 이어짐)이고,
      // 오늘자 방송이 따로 없을 때만 '오늘의 뱅온'에 어제자 정보로 표시한다.
      if (it._carry) {
        const cm = scheduleMember(it);
        if (!cm || !cm.isLive || hasTodayLive.has(cm.key)) return;
      }
      const m = scheduleMember(it);
      if (m && groups.has(m.key)) { groups.get(m.key).items.push(it); return; }
      // 로스터에 없는(졸업 등) 이름은 별도 그룹으로.
      const k = 'x:' + (it.channelKey || it.stellarName || '');
      if (!groups.has(k)) groups.set(k, { m: null, name: it.stellarName || '', key: k, items: [] });
      groups.get(k).items.push(it);
    });

    const rows = [];
    groups.forEach((g) => {
      const its = g.items;
      const live = !!(g.m && g.m.isLive);
      const pinnedM = !!(g.m && isPinned(g.m.key));
      const order = g.m && g.m.order != null ? g.m.order : 999;
      if (!its.length) {
        rows.push({ ...g, items: [], noinfo: true, rest: false, live, ended: false, upcoming: false, t: Infinity, titleLabel: '', primary: null, order, pinnedM });
        return;
      }
      const allRest = its.every((it) => isRest(it.title));
      // 남은 '예정' 이 하나도 없으면(모두 지난 확정 시각) 종료로 본다.
      const hasFuture = its.some((it) => !isRest(it.title) && (!it.isFixedTime || (parseOpen(it.startDateTime) ?? Infinity) >= now));
      const ended = !live && !allRest && !hasFuture;
      // '종료'는 방금 끝난 방송에만 쓴다. 밤샘/새벽처럼 시작이 오래전(5시간 초과)인 방송은
      // 하루 종일 '종료'로 남지 않고 '정보 없음'으로 처리한다.
      if (ended) {
        const starts = its.filter((it) => !isRest(it.title)).map((it) => parseOpen(it.startDateTime)).filter((x) => x != null);
        const latest = starts.length ? Math.max(...starts) : null;
        if (latest == null || now - latest > 5 * 60 * 60 * 1000) {
          rows.push({ ...g, items: [], noinfo: true, rest: false, live, ended: false, upcoming: false, t: Infinity, titleLabel: '', primary: null, order, pinnedM });
          return;
        }
      }
      const upcoming = !live && !allRest && !ended;
      const times = its.map((it) => parseOpen(it.startDateTime)).filter((x) => x != null);
      const t = times.length ? Math.min(...times) : Infinity;
      // 표시 라벨: 휴방→현지화, 그 외→제목. 중복 제거 후 ' + ' 로 합침(예: '휴방 + 스페이스').
      const labels = [...new Set(its.map((it) => (isRest(it.title) ? T('sched.rest') : (it.title || '').trim())).filter(Boolean))];
      const titleLabel = labels.join(' + ');
      // 시각/상세용 대표 항목: 시간 있는 비휴방 우선.
      const primary = its.find((it) => !isRest(it.title) && parseOpen(it.startDateTime) != null) || its[0];
      rows.push({ ...g, items: its, noinfo: false, rest: allRest, live, ended, upcoming, t, titleLabel, primary, order, pinnedM });
    });

    // 즐겨찾기 → 방송 중 → 예정/휴방 → 종료 → 정보 없음, 같은 그룹 안에서는 기수(로스터) 순
    rows.sort((a, b) => {
      const rk = (r) => (r.live ? 0 : r.noinfo ? 4 : r.ended ? 3 : r.rest ? 2 : 1);
      return (a.pinnedM ? 0 : 1) - (b.pinnedM ? 0 : 1) || rk(a) - rk(b) || a.order - b.order || (a.t || 0) - (b.t || 0);
    });
    return rows;
  }
  const scheduleSig = (rows) => rows.map((r) => `${r.key}|${r.noinfo ? 'N' : r.titleLabel}|${r.t}|${r.live ? 'L' : r.ended ? 'E' : r.rest ? 'R' : '-'}|${r.pinnedM ? 'P' : ''}`).join(';');

  // 카드 한 장의 내용 서명(내용이 바뀔 때만 다시 채워 마퀴 리셋을 막는다).
  // 언어(I18N.lang)를 포함해, 언어를 바꾸면 카드가 다시 채워져 멤버 이름·라벨이 함께 갱신되게 한다
  // (예전엔 제목이 원본 그대로라 서명이 같아, 이름만 옛 언어로 남던 문제).
  const schedRowSig = (r) => `${I18N.lang}|${r.noinfo ? 'N' : r.titleLabel}|${r.t}|${r.live ? 'L' : r.ended ? 'E' : r.rest ? 'R' : '-'}|${r.pinnedM ? 'P' : ''}`;

  // 카드 엘리먼트에 row 내용을 채운다(신규/갱신 공용). className 은 상태에 맞게 매번 새로.
  function fillSchedCard(card, row) {
    const { items: its, name, noinfo, rest, live, ended, upcoming, titleLabel, primary } = row;
    const badge = live
      ? `<span class="sched-started live"><span class="ss-dot"></span>${esc(T('sched.started'))}</span>`
      : ended
        ? `<span class="sched-started ended">${esc(T('sched.ended'))}</span>`
        : (!noinfo && upcoming)
          ? `<span class="sched-started upcoming">${esc(T('sched.upcoming'))}</span>`
          : '';
    let timeHtml;
    if (noinfo) timeHtml = `<span class="sched-time noinfo">${esc(T('sched.noinfo'))}</span>`;
    else if (rest) timeHtml = `<span class="sched-time rest">${esc(T('sched.rest'))}</span>`;
    else {
      const it = primary;
      const hasT = it && parseOpen(it.startDateTime) != null;
      let tl = hasT ? (it.isFixedTime ? timeLabel(it.startDateTime) : timeLabel(it.startDateTime) + '~') : '';
      // 어제 시작해 오늘까지 이어지는 방송은 시각 앞에 '어제'를 붙여 혼동을 막는다(오늘 새벽 시작분은 그대로).
      if (tl && it && it._carry && it._fromYesterday) tl = `${I18N.lang === 'en' ? 'Yesterday' : I18N.lang === 'ja' ? '昨日' : '어제'} ${tl}`;
      timeHtml = `<span class="sched-time">${esc(tl)}</span>`;
    }
    const showTitle = !noinfo && titleLabel && !(rest && its.length === 1);
    // 방송 제목(휴방 아님)은 여러 개가 합쳐진 조합('저챗 + 노래')이어도 통째로 번역에 넘긴다.
    // (예전엔 단발 제목만 번역돼서 일부 뱅온 정보가 번역이 안 되던 문제)
    const allNonRest = !noinfo && Array.isArray(its) && its.length > 0 && its.every((it) => !isRest(it.title));
    const ttAttr = allNonRest && titleLabel ? ` data-tt="${esc(titleLabel)}"` : '';
    // 진입/퇴장 애니메이션 클래스는 유지한 채 상태(past/live/noinfo)만 갱신.
    const anim = (card.classList.contains('sched-entering') ? ' sched-entering' : '') + (card.classList.contains('sched-collapsed') ? ' sched-collapsed' : '');
    card.className = 'sched-card' + (ended ? ' past' : '') + (live ? ' live' : '') + (noinfo ? ' noinfo' : '') + anim;
    card.innerHTML = `
      <div class="sched-time-row">${timeHtml}${badge}</div>
      <div class="sched-name">${esc(name)}</div>
      ${showTitle ? `<div class="sched-title"><span class="stt"${ttAttr}>${esc(titleLabel)}</span></div>` : ''}`;
    card.onclick = () => openSchedDetail(row);
    card._csig = schedRowSig(row);
  }

  // 사라지는 카드: 접힘 애니메이션 후 DOM 제거.
  function leaveSchedCard(el) {
    if (el._leaving) return;
    el._leaving = true;
    el.style.pointerEvents = 'none';
    el.classList.add('sched-collapsed');
    setTimeout(() => { el.remove(); }, 340);
  }

  // 키(멤버) 기준으로 기존 카드를 재사용/추가/제거 → 추가·제거만 애니메이션되고 나머지는 유지.
  function reconcileSchedule(strip, rows) {
    // 메시지/키 없는 잔여 노드 정리(빈/에러 → 카드 전환 등).
    [...strip.children].forEach((el) => { if (!(el.dataset && el.dataset.key) && !el._leaving) el.remove(); });
    const existing = new Map();
    [...strip.children].forEach((el) => { if (el.dataset && el.dataset.key && !el._leaving) existing.set(el.dataset.key, el); });
    const newKeys = new Set(rows.map((r) => r.key));
    // 제거: 새 목록에 없는 카드
    existing.forEach((el, key) => { if (!newKeys.has(key)) leaveSchedCard(el); });
    // 추가/갱신 + 순서 정렬
    let prev = null;
    rows.forEach((row) => {
      let el = existing.get(row.key);
      if (el) {
        if (el._csig !== schedRowSig(row)) { fillSchedCard(el, row); applyMarquee(el.querySelector('.sched-title')); }
      } else {
        el = document.createElement('div');
        el.dataset.key = row.key;
        fillSchedCard(el, row);
        el.classList.add('sched-entering'); // 키프레임 진입 애니메이션(삽입 즉시 자동 재생)
        el.addEventListener('animationend', () => el.classList.remove('sched-entering'), { once: true });
        (prev ? prev.after(el) : strip.prepend(el));
        setTimeout(() => { el.classList.remove('sched-entering'); applyMarquee(el.querySelector('.sched-title')); }, 360);
      }
      // 순서 맞추기(prev 다음으로 이동)
      if (prev) { if (prev.nextSibling !== el) prev.after(el); }
      else if (strip.firstChild !== el) strip.prepend(el);
      prev = el;
    });
  }

  function renderSchedule(force = false) {
    const strip = $('#schedStrip');
    if (state.scheduleItems === 'error') { strip.innerHTML = `<div class="sched-error">${errorBoxHtml(T('sched.error'), state.scheduleError)}</div>`; state._schedSig = '__err'; return; }
    if (!Array.isArray(state.scheduleItems)) return; // 아직 로드 전

    const rows = classifyScheduleRows();
    if (!rows || !rows.length) { strip.innerHTML = `<div class="sched-empty">${esc(T('sched.empty'))}</div>`; state._schedSig = '__empty'; return; }
    const sig = scheduleSig(rows);
    // 분류(시작/종료/순서)가 실제로 바뀔 때만 반영한다.
    if (!force && sig === state._schedSig) return;
    state._schedSig = sig;

    reconcileSchedule(strip, rows);
    translateTitles();
  }

  // 뱅온 카드 클릭 → 상세(멤버·상태 + 각 일정 시각/내용, 방송 중이면 라이브 제목/카테고리/시청자). 인자는 멤버 그룹 row.
  function openSchedDetail(row) {
    const m = row.m;
    const its = row.items || [];
    const { noinfo, rest, live, ended, upcoming } = row;
    const status = noinfo ? T('sched.noinfo') : rest ? T('sched.rest') : live ? T('sched.started') : ended ? T('sched.ended') : T('sched.upcoming');

    const modalInner = document.querySelector('.sched-modal');
    if (m && m.accent) modalInner.style.setProperty('--card-accent', m.accent);

    // 모달은 한 번만 만들어지는 고정 요소라, addEventListener 대신 onerror 프로퍼티로 폴백을 건다.
    const ava = $('#sdAva');
    ava.onerror = () => { ava.onerror = null; ava.src = 'assets/logo_star.png'; };
    ava.src = (m && m.avatar) || 'assets/logo_star.png';
    $('#sdName').textContent = row.name || '';
    const st = $('#sdStatus');
    st.textContent = status;
    st.className = 'sd-status ' + (live ? 'live' : ended ? 'ended' : noinfo ? 'noinfo' : rest ? '' : 'upcoming');

    // 방송 중이면 라이브 썸네일 표시(캐시 무효화 포함). 없거나 로딩 실패하면 숨긴다.
    const thumbEl = $('#sdThumb');
    if (live && m && m.thumbnail) {
      thumbEl.onerror = () => { thumbEl.onerror = null; thumbEl.hidden = true; };
      thumbEl.hidden = false;
      thumbEl.src = bustThumb(m.thumbnail);
    } else {
      thumbEl.onerror = null;
      thumbEl.hidden = true;
      thumbEl.removeAttribute('src');
    }

    const rowsHtml = [];
    const addRow = (k, vHtml) => rowsHtml.push(`<div class="sd-row"><span class="sd-k">${esc(k)}</span><span class="sd-v">${vHtml}</span></div>`);
    if (noinfo || !its.length) {
      addRow(T('schedD.plan'), esc(T('sched.noinfoDesc')));
    } else {
      // 각 일정 항목: 시각 + 내용(휴방/스페이스/제목 등)
      its.forEach((it) => {
        const isR = isRest(it.title);
        const hasT = parseOpen(it.startDateTime) != null;
        const timeStr = isR ? T('sched.rest') : (hasT ? (it.isFixedTime ? timeLabel(it.startDateTime) : timeLabel(it.startDateTime) + '~') : T('schedD.plan'));
        const label = isR ? T('sched.rest') : (it.title || '');
        // 휴방은 이미 현지화된 라벨이라 번역(data-tt)을 걸지 않는다(엉뚱한 번역 방지).
        const ttAttr = isR || !it.title ? '' : ` data-tt="${esc(it.title)}"`;
        addRow(timeStr, `<span${ttAttr}>${esc(label)}</span>`);
      });
      if (live && m) {
        if (m.title) addRow(T('schedD.liveTitle'), `<span data-tt="${esc(m.title)}">${esc(m.title)}</span>`);
        if (m.category) addRow(T('schedD.category'), esc(m.category));
        if (m.viewerCount != null) addRow(T('schedD.viewers'), esc(nfmt(m.viewerCount)));
      }
    }
    $('#sdBody').innerHTML = rowsHtml.join('');

    const acts = [];
    if (live && m && m.liveUrl) acts.push(`<button class="mini-btn" data-url="${esc(m.liveUrl)}">${icon('play', 15)} ${esc(T('card.go'))}</button>`);
    const chUrl = (m && (m.channelUrl || m.liveUrl)) || null;
    if (chUrl) acts.push(`<button class="mini-btn ghost" data-url="${esc(chUrl)}">${esc(T('card.channel'))}</button>`);
    const actEl = $('#sdActions');
    actEl.innerHTML = acts.join('');
    actEl.querySelectorAll('[data-url]').forEach((b) => b.addEventListener('click', () => { openLink(b.dataset.url); closeModalEl('#schedModal'); }));

    openModalEl('#schedModal');
    translateTitles(); // 제목/카테고리를 현재 언어로(캐시 있으면 즉시)
  }

  // ── 뱅온 캘린더 ──────────────────────────────
  // 보고 있는 연/월(m: 0~11, KST 기준). detailDay: 오른쪽 세부 패널에 띄운 날짜 키(없으면 '').
  // cells/events/todayKey 는 한 번 불러온 뒤 세부 패널 리렌더에서 재사용(재요청 방지).
  const CAL = { y: 0, m: 0, detailDay: '', cells: [], events: [], dayMembers: new Map(), todayKey: '' };
  const CAL_MAX_LANES = 4; // 한 주에 기본으로 보여줄 최대 막대 줄 수(넘치면 '+N' 으로 접음)
  const CAL_BAR_TOP = 30;  // 막대 시작 y(px) — 날짜 숫자/오늘 강조 링과 겹치지 않도록 아래에서 시작
  const CAL_LANE_H = 16;   // 막대 한 줄 높이(px) — 6주가 스크롤 없이 들어가도록 촘촘하게
  const mdOf = (dk) => { const p = dk.split('-'); return `${+p[1]}/${+p[2]}`; }; // '2026-08-05' → '8/5'
  const CAL_WD = {
    ko: ['일', '월', '화', '수', '목', '금', '토'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    ja: ['日', '月', '火', '水', '木', '金', '土'],
  };
  const CAL_MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const dayKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const dayDiff = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;

  function calTitle(y, m) {
    const l = I18N.lang;
    if (l === 'en') return `${CAL_MON_EN[m]} ${y}`;
    if (l === 'ja') return `${y}年${m + 1}月`;
    return `${y}년 ${m + 1}월`;
  }

  // 캘린더는 web(stellarium.kr/calendar)을 webview 로 임베드해 보여준다.
  // (예전의 네이티브 캘린더 렌더 함수들은 더 이상 호출되지 않는다 — 아래 loadCalendar 등)
  async function openCalendar() {
    openModalEl('#calModal');
    const wv = $('#calWebview');
    if (!wv || wv._loaded) return; // 최초 1회만 로드하고, 이후엔 그대로 유지
    wv._loaded = true;
    const loading = $('#calLoading');
    const errEl = $('#calError');
    if (loading) loading.hidden = false;
    if (errEl) errEl.hidden = true;
    let url = 'https://stellarium.kr/calendar';
    try { url = await api.getWebCalUrl(); } catch { /* 기본값 사용 */ }
    wv.addEventListener('did-finish-load', () => { if (loading) loading.hidden = true; });
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return; // ABORTED(하위 리소스/취소) 은 무시
      if (loading) loading.hidden = true;
      if (errEl) { errEl.hidden = false; errEl.innerHTML = errorBoxHtml(T('sched.error'), `${e.errorDescription || ''} — ${url}`); }
    });
    wv.src = url;
  }
  // ── 통합 설문(web /survey 를 webview 로) ─────────────────────
  async function openSurvey() {
    openModalEl('#surveyModal');
    const wv = $('#surveyWebview');
    if (!wv || wv._loaded) return; // 최초 1회만 로드(참여 상태는 페이지가 스스로 관리)
    wv._loaded = true;
    const loading = $('#surveyLoading');
    const errEl = $('#surveyError');
    if (loading) loading.hidden = false;
    if (errEl) errEl.hidden = true;
    let url = '';
    try { url = await api.getSurveyUrl(); } catch { /* 실패 시 아래에서 오류 표시 */ }
    wv.addEventListener('did-finish-load', () => { if (loading) loading.hidden = true; });
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return; // ABORTED 무시
      if (loading) loading.hidden = true;
      if (errEl) { errEl.hidden = false; errEl.innerHTML = errorBoxHtml(T('sched.error'), `${e.errorDescription || ''} — ${url}`); }
    });
    if (url) wv.src = url;
  }
  // 배너는 '진행 중 · 닫지 않음' 이면 보인다(집계는 받지 않는다).
  // 이미 참여한 기기에도 계속 띄워, 언제든 눌러 응답을 수정하거나 취소할 수 있게 한다.
  async function updateSurveyBanner() {
    const banner = $('#surveyBanner');
    if (!banner) return;
    try {
      if (await api.isSurveyDismissed()) { banner.hidden = true; return; }
      const s = await api.getSurveyStatus();
      if (!s || !s.open) { banner.hidden = true; return; }
      const voted = !!s.choice;
      $('#surveyBannerT').textContent = T(voted ? 'survey.bannerTVoted' : 'survey.bannerT');
      $('#surveyBannerD').textContent = T(voted ? 'survey.bannerDVoted' : 'survey.bannerD');
      $('#surveyJoin').textContent = T(voted ? 'survey.edit' : 'survey.join');
      banner.hidden = false;
    } catch { banner.hidden = true; }
  }
  function wireSurvey() {
    $('#surveyJoin').addEventListener('click', openSurvey);
    $('#surveyDismiss').addEventListener('click', async () => { $('#surveyBanner').hidden = true; try { await api.dismissSurvey(); } catch { /* 무시 */ } });
    $('#closeSurvey').addEventListener('click', () => { closeModalEl('#surveyModal'); updateSurveyBanner(); });
    $('#surveyModal').addEventListener('click', (e) => { if (e.target.id === 'surveyModal') { closeModalEl('#surveyModal'); updateSurveyBanner(); } });
  }

  // 월 이동: 켜놓은 오른쪽 세부 패널은 그대로 유지한다(원래 선택한 날의 일정을 계속 보여줌).
  function calShift(delta) { let m = CAL.m + delta, y = CAL.y; if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; } CAL.y = y; CAL.m = m; loadCalendar(); }

  async function loadCalendar() {
    $('#calTitle').textContent = calTitle(CAL.y, CAL.m);
    const grid = $('#calGrid');
    grid.innerHTML = `<div class="cal-loading"><span class="cl-spinner"></span></div>`;

    // 6주(42칸) 그리드: 그 달 1일이 든 주의 일요일부터.
    const firstUTC = Date.UTC(CAL.y, CAL.m, 1);
    const dow = new Date(firstUTC).getUTCDay();
    const startUTC = firstUTC - dow * 86400000;
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startUTC + i * 86400000);
      const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
      cells.push({ y, m, day, key: dayKey(y, m, day), inMonth: m === CAL.m });
    }
    const todayKey = (() => { const t = new Date(Date.now() + KST_OFFSET); return dayKey(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); })();

    let items = [];
    try {
      const data = await api.getScheduleRange(cells[0].key + 'T00:00:00', cells[41].key + 'T23:59:59');
      items = Array.isArray(data) ? data : [];
    } catch { items = []; }

    CAL.cells = cells;
    CAL.todayKey = todayKey;
    const built = buildCalEvents(items); // { events, dayMembers }
    CAL.events = assignLanes(built.events);
    CAL.dayMembers = built.dayMembers;
    renderCalendarGrid();
  }

  // 캘린더 그리드 렌더(불러온 데이터 재사용). 세부 패널 열고 닫을 때도 재요청 없이 이 함수만 다시 부른다.
  // 한 주에 막대가 너무 많으면(CAL_MAX_LANES 초과) 아래를 '+N' 으로 접어 '벽'처럼 되지 않게 한다.
  // '+N' 을 누르면 그 날의 세부 일정을 오른쪽 패널에 띄운다(openDayDetail).
  function renderCalendarGrid() {
    const { cells, events, todayKey } = CAL;
    // 전체 화면을 꽉 채우므로, 그리드 높이에 맞춰 한 주에 보여줄 줄 수를 자동으로 늘린다(스크롤 없이 최대한 다 표시).
    let availH = $('#calGrid').clientHeight;
    if (!availH || availH < 300) availH = Math.max(560, window.innerHeight - 160); // 아직 레이아웃 전이면 창 기준 추정
    const maxLanes = Math.max(4, Math.min(12, Math.floor((availH / 6 - CAL_BAR_TOP - 16) / CAL_LANE_H)));
    let html = '';
    for (let w = 0; w < 6; w++) {
      const week = cells.slice(w * 7, w * 7 + 7);
      const wStart = week[0].key, wEnd = week[6].key;

      let barsHtml = '';
      let shownLanes = 0;           // 실제로 그린 막대 줄 수(주 높이 계산용)
      const hidden = [0, 0, 0, 0, 0, 0, 0]; // 요일별 접힌(숨긴) 막대 수
      events.forEach((ev) => {
        if (ev.end < wStart || ev.start > wEnd) return; // 이 주와 안 겹침
        const segStart = ev.start < wStart ? wStart : ev.start;
        const segEnd = ev.end > wEnd ? wEnd : ev.end;
        const c1 = week.findIndex((c) => c.key === segStart);
        const c2 = week.findIndex((c) => c.key === segEnd);
        if (ev.lane >= maxLanes) { for (let c = c1; c <= c2; c++) hidden[c]++; return; } // 한도 초과 → '+N'
        const isStart = ev.start === segStart, isEnd = ev.end === segEnd;
        const left = (c1 / 7) * 100, width = ((c2 - c1 + 1) / 7) * 100;
        const top = CAL_BAR_TOP + ev.lane * CAL_LANE_H; // 날짜 숫자(오늘 강조 링 포함) 아래에서 시작
        shownLanes = Math.max(shownLanes, ev.lane + 1);
        // 좌우로 살짝 띄워(2px) 막대끼리 붙지 않게 하고, 어두운 막대는 글자를 흰색으로(inkFor).
        // 라벨은 막대의 실제 시작 주뿐 아니라, 다음 주로 이어져 그 주 왼쪽 끝(c1===0)에서 시작하는
        // 조각에도 반복 표기한다 → 이어지는 조각이 '빈 상자'로 보이지 않게(구글 캘린더 방식).
        const showLabel = isStart || c1 === 0;
        // 빙하기는 '언제부터~언제까지' 기간을 라벨에 붙인다('빙하기'는 언어별 표기).
        // 방송 제목은 data-tt 로 감싸 translateTitles() 가 현재 언어로 번역한다(멤버 이름은 이미 언어별).
        const barLabel = ev.ice
          ? `❄ ${esc(ev.name)} · ${esc(T('cal.ice'))} (${mdOf(ev.start)}~${mdOf(ev.end)})`
          : (ev.title ? `${esc(ev.name)} · <span data-tt="${esc(ev.title)}">${esc(ev.title)}</span>` : esc(ev.name));
        barsHtml += `<div class="cal-bar${isStart ? ' s' : ''}${isEnd ? ' e' : ''}${ev.ice ? ' ice' : ''}" data-ev="${esc(ev.id)}" style="left:calc(${left}% + 2px);width:calc(${width}% - 4px);top:${top}px;${ev.ice ? '' : `color:${inkFor(ev.accent)};`}--bar:${esc(ev.accent)}">${showLabel ? `<span class="cal-bar-t">${barLabel}</span>` : ''}</div>`;
      });

      // '+N' 접힘 표시(요일별) — 누르면 그 날 세부 패널을 연다.
      const rowTop = CAL_BAR_TOP + shownLanes * CAL_LANE_H;
      let moreHtml = '';
      hidden.forEach((n, ci) => {
        if (!n) return;
        moreHtml += `<div class="cal-more" data-day="${esc(week[ci].key)}" style="left:calc(${(ci / 7) * 100}% + 2px);width:calc(${100 / 7}% - 4px);top:${rowTop}px">+${n}</div>`;
      });

      const daysHtml = week.map((c) => `<div class="cal-day${c.inMonth ? '' : ' out'}${c.key === todayKey ? ' today' : ''}${c.key === CAL.detailDay ? ' sel' : ''}"><span class="cal-dnum">${c.day}</span></div>`).join('');
      const hasRow = hidden.some((n) => n > 0);
      const minH = Math.max(58, CAL_BAR_TOP + shownLanes * CAL_LANE_H + (hasRow ? 16 : 6));
      html += `<div class="cal-week" style="min-height:${minH}px">${daysHtml}${barsHtml}${moreHtml}</div>`;
    }
    $('#calGrid').innerHTML = html;
    translateTitles(); // 막대 제목(data-tt)을 현재 언어로 — 캐시 있으면 즉시, 없으면 번역 요청
  }

  // 오른쪽 세부 일정 패널 열기/닫기/렌더 ─────────────────────
  function openDayDetail(dk) {
    CAL.detailDay = dk;
    renderCalendarDetail();
    const d = $('#calDetail');
    d.hidden = false;
    // 다음 프레임에 .open 을 붙여 flex-basis 트랜지션(0→열림)이 재생되게 한다.
    // rAF 는 백그라운드/최소화 시 멈출 수 있어 setTimeout 도 함께 걸어 확실히 열리게 한다.
    requestAnimationFrame(() => d.classList.add('open'));
    setTimeout(() => d.classList.add('open'), 30);
    renderCalendarGrid(); // 선택한 날 강조
  }
  function closeDayDetail() {
    const d = $('#calDetail');
    CAL.detailDay = '';
    if (CAL.cells.length) renderCalendarGrid(); // 강조 해제
    if (!d) return;
    if (!d.classList.contains('open')) { d.hidden = true; return; }
    d.classList.remove('open');
    // 닫힘 트랜지션이 끝난 뒤에 감춘다(중간에 다시 열리면 그대로 둠).
    setTimeout(() => { if (CAL.detailDay === '') d.hidden = true; }, 280);
  }
  // 세부 항목 한 줄의 제목 HTML(빙하기 기간 포함).
  // 빙하기 라벨은 언어별(T)로, 방송 제목은 data-tt 로 감싸 translateTitles() 가 번역한다.
  function detailTitleHtml(ev) {
    const combined = ev.titles.join(' + ');
    const ttSpan = combined ? `<span data-tt="${esc(combined)}">${esc(combined)}</span>` : '';
    if (!ev.ice) return ttSpan;
    const iceLabel = `${esc(T('cal.ice'))}${ev.iceStart ? ` (${mdOf(ev.iceStart)}~${mdOf(ev.iceEnd)})` : ''}`;
    return combined ? `${iceLabel} · ${ttSpan}` : iceLabel;
  }
  function fillDetailItem(el, ev) {
    el.className = 'cd-item' + (ev.ice ? ' ice' : '');
    el.innerHTML = `
      <span class="cd-dot" style="background:${esc(ev.accent)}"></span>
      <div class="cd-txt">
        <div class="cd-name">${ev.ice ? '❄ ' : ''}${esc(ev.name)}</div>
        <div class="cd-title">${detailTitleHtml(ev)}</div>
      </div>`;
  }
  // 항목을 순차 등장(stagger). 재생 중이면 리셋 후 다시 → 날짜를 바꿔도 전체가 다시 차례로 뜬다.
  function staggerInDetailItem(el, idx) {
    el.classList.remove('cd-entering');
    void el.offsetWidth; // 애니메이션 리셋
    el.style.animationDelay = idx * 40 + 'ms';
    el.classList.add('cd-entering');
    const clear = () => { el.classList.remove('cd-entering'); el.style.animationDelay = ''; };
    el.addEventListener('animationend', clear, { once: true });
    setTimeout(clear, 520 + idx * 40);
  }
  // 사라지는 항목: 세로로 접히며(위로) 사라진 뒤 제거.
  function leaveDetailItem(el) {
    if (el._leaving) return;
    el._leaving = true;
    el.style.pointerEvents = 'none';
    el.style.maxHeight = el.offsetHeight + 'px';
    void el.offsetHeight; // reflow 강제 → 이어지는 0 으로의 트랜지션이 재생되게
    el.classList.add('cd-leaving');
    el.style.maxHeight = '0px';
    setTimeout(() => el.remove(), 300);
  }

  function renderCalendarDetail() {
    const dk = CAL.detailDay;
    if (!dk) return;
    // 그 날의 멤버 목록(같은 스텔라는 하나로 묶여 제목이 합쳐져 있음). 빙하기 → 이름 순.
    const list = [...(CAL.dayMembers.get(dk) || new Map()).values()]
      .sort((a, b) => (!!b.ice !== !!a.ice ? (a.ice ? -1 : 1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((ev) => ({ ...ev, _key: (ev.m && ev.m.key) || ev.name }));
    const d = new Date(dk + 'T00:00:00Z');
    const wd = (CAL_WD[I18N.lang] || CAL_WD.ko)[d.getUTCDay()];
    const mo = d.getUTCMonth(), day = d.getUTCDate();
    const dateLabel = I18N.lang === 'en' ? `${CAL_MON_EN[mo]} ${day}` : I18N.lang === 'ja' ? `${mo + 1}月${day}日` : `${mo + 1}월 ${day}일`;

    // 패널 골격은 한 번만 만들고(헤더/카운트/리스트), 리스트만 키(멤버) 기준으로 갱신한다.
    const panel = $('#calDetail');
    let inner = panel.querySelector('.cd-inner');
    if (!inner) {
      panel.innerHTML = `<div class="cd-inner"><div class="cd-head"><div class="cd-date"></div><button class="cd-close" id="calDetailClose" aria-label="닫기">✕</button></div><div class="cd-count"></div><div class="cd-list"></div></div>`;
      inner = panel.querySelector('.cd-inner');
    }
    inner.querySelector('.cd-date').innerHTML = `${esc(dateLabel)} <span class="cd-dow${d.getUTCDay() === 0 ? ' sun' : ''}">${esc(wd)}</span>`;
    inner.querySelector('.cd-count').textContent = `${list.length}${T('cal.count')}`;

    const listEl = inner.querySelector('.cd-list');
    // 새 목록을 그린다(비우고 차례로 등장).
    const build = () => {
      listEl.innerHTML = '';
      if (!list.length) { listEl.innerHTML = `<div class="cd-empty">${esc(T('cal.noSchedule') || '일정이 없어요')}</div>`; return; }
      list.forEach((ev, idx) => {
        const el = document.createElement('div');
        el.dataset.k = ev._key;
        fillDetailItem(el, ev);
        listEl.appendChild(el);
        staggerInDetailItem(el, idx);
      });
      translateTitles(); // 세부 패널 제목(data-tt)도 현재 언어로
    };
    // 이미 다른 날 내용이 있으면: 먼저 전부 페이드 아웃 → 그다음 새 내용이 차례로 등장(사라지고 다시 뜨는 전환).
    const hadContent = listEl.querySelector('.cd-item, .cd-empty');
    if (hadContent) {
      [...listEl.children].forEach((el) => {
        el.style.transition = 'opacity .16s ease, transform .16s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateX(12px)';
        el.style.pointerEvents = 'none';
      });
      setTimeout(build, 175);
    } else {
      build();
    }
  }

  // 연속된 날짜 목록(정렬 무관)을 [start,end] 구간들로 묶는다. 예) 3,4,5,8 → [[3,5],[8,8]]
  function mergeDateRuns(dates) {
    const sorted = [...dates].sort();
    const runs = [];
    if (!sorted.length) return runs;
    let s = sorted[0], p = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (dayDiff(p, sorted[i]) === 1) p = sorted[i];
      else { runs.push([s, p]); s = sorted[i]; p = sorted[i]; }
    }
    runs.push([s, p]);
    return runs;
  }

  // 스케줄 항목 → 캘린더 이벤트(막대) + 날짜별 멤버 목록(세부 패널용).
  // 규칙:
  //  - 막대는 '멤버 · 제목' 단위: 같은 멤버·같은 제목의 연속된 날은 하나의 막대로 잇는다(제목이 보인다).
  //  - 빙하기: 연속된 '휴방' 구간에 '빙하기' 비고가 하나라도 있으면 그 구간 전체를 빙하기로 이어 붙인다
  //    (비고가 일부 날에만 있어도 처음~끝까지 하나의 막대로).
  //  - 일반 휴방(빙하기 아님)은 캘린더에서 제외.
  //  - 세부 패널(dayMembers): 같은 날 같은 멤버는 한 줄로 묶고 제목을 합친다.
  function buildCalEvents(items) {
    // 1) 멤버별로 rest(휴방)·live 날짜를 모은다. live 는 '그 날의 제목들'을 모아 하나로 합친다.
    const members = new Map(); // key -> { m, name, accent, rest:Map(date->hasIce), liveByDay:Map(date->titles[]) }
    items.forEach((it) => {
      if (/강지/.test(it.stellarName || '')) return;
      const dk = (it.startDateTime || '').slice(0, 10);
      if (!dk) return;
      const m = scheduleMember(it);
      const key = m ? m.key : (it.stellarName || '?');
      if (!members.has(key)) members.set(key, { m, name: m ? I18N.memberName(m) : (it.stellarName || ''), accent: (m && m.accent) || '#8a7ffb', rest: new Map(), liveByDay: new Map() });
      const rec = members.get(key);
      if (isRest(it.title)) {
        const hasIce = /빙하기/.test((it.remark || '') + ' ' + (it.title || ''));
        rec.rest.set(dk, (rec.rest.get(dk) || false) || hasIce);
      } else {
        if (!rec.liveByDay.has(dk)) rec.liveByDay.set(dk, []);
        if (it.title) rec.liveByDay.get(dk).push(it.title);
      }
    });

    const events = [];
    const dayMembers = new Map(); // date -> Map(key -> { m, name, accent, ice, titles[] })
    let id = 0;
    const markDay = (date, key, rec, patch) => {
      if (!dayMembers.has(date)) dayMembers.set(date, new Map());
      const dm = dayMembers.get(date);
      if (!dm.has(key)) dm.set(key, { m: rec.m, name: rec.name, accent: rec.accent, ice: false, iceStart: '', iceEnd: '', titles: [] });
      const e = dm.get(key);
      if (patch.ice) e.ice = true;
      if (patch.iceRange) { e.iceStart = patch.iceRange[0]; e.iceEnd = patch.iceRange[1]; }
      if (patch.titles && patch.titles.length) e.titles.push(...patch.titles.filter((t) => t));
    };

    members.forEach((rec, key) => {
      // 휴방 구간: 구간 안에 빙하기 비고가 하나라도 있으면 전체를 빙하기 막대로(기간 라벨 포함), 아니면 제외.
      mergeDateRuns([...rec.rest.keys()]).forEach(([s, e]) => {
        let iceRun = false;
        rec.rest.forEach((hasIce, d) => { if (d >= s && d <= e && hasIce) iceRun = true; });
        if (!iceRun) return; // 일반 휴방 구간 → 캘린더에서 제외
        events.push({ id: 'e' + (id++), m: rec.m, name: rec.name, title: '빙하기', ice: true, accent: rec.accent, start: s, end: e });
        rec.rest.forEach((_h, d) => { if (d >= s && d <= e) markDay(d, key, rec, { ice: true, iceRange: [s, e] }); });
      });
      // 방송 막대: '그 날 한 멤버의 제목들'을 ' + ' 로 합쳐 하루에 막대 하나로 묶는다(같은 스텔라 중복 제거).
      // 연속으로 합친 제목이 같으면 하나의 막대로 이어붙인다.
      const byCombined = new Map(); // combinedTitle -> Set(date)
      rec.liveByDay.forEach((titles, d) => {
        markDay(d, key, rec, { titles }); // 패널용(제목 합침은 렌더에서)
        const str = titles.filter((t) => t).join(' + ');
        if (!byCombined.has(str)) byCombined.set(str, new Set());
        byCombined.get(str).add(d);
      });
      byCombined.forEach((dates, str) => {
        mergeDateRuns([...dates]).forEach(([s, e]) => {
          events.push({ id: 'e' + (id++), m: rec.m, name: rec.name, title: str, ice: false, accent: rec.accent, start: s, end: e });
        });
      });
    });
    return { events, dayMembers };
  }
  // 겹치는 이벤트를 세로 레인으로 분리(구간 스케줄링).
  // 반드시 '시작일 오름차순'으로 처리해야 그리디가 정확하다(겹치지 않는데 아래로 밀려 위가 비는 현상 방지).
  // 같은 날 시작이면 빙하기 먼저, 그다음 긴 것 먼저 → 빙하기/장기 일정이 위쪽 레인에 오게.
  function assignLanes(events) {
    const dur = (e) => dayDiff(e.start, e.end);
    const sorted = [...events].sort((a, b) => {
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      if (!!b.ice !== !!a.ice) return a.ice ? -1 : 1;
      return dur(b) - dur(a);
    });
    const laneEnds = []; // 각 레인에 마지막으로 놓인 막대의 끝 날짜
    sorted.forEach((ev) => {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] >= ev.start) lane++;
      ev.lane = lane;
      laneEnds[lane] = ev.end;
    });
    return sorted;
  }

  function wireCalendar() {
    $('#btnCalendar').addEventListener('click', openCalendar);
    $('#closeCal').addEventListener('click', () => closeModalEl('#calModal'));
    $('#calModal').addEventListener('click', (e) => { if (e.target.id === 'calModal') closeModalEl('#calModal'); });
  }

  // 제목이 카드 폭보다 길면 양쪽 그라데이션 + 좌우 왕복(마퀴) 애니메이션
  // 번역으로 텍스트가 바뀐 뒤 다시 호출될 수 있으므로, 매번 이전 상태를 초기화하고 새로 측정한다(멱등).
  function applyMarquee(box) {
    if (!box) return;
    const text = box.querySelector('.stt');
    if (!text) return;
    const FADE = 12; // 양끝 페이드(가림) 폭. CSS mask 의 페이드 폭과 맞춘다.
    // 재측정 전 초기화 — 패딩이 누적되거나 옛 --shift 가 남지 않도록.
    box.classList.remove('marquee');
    text.style.paddingLeft = '';
    text.style.paddingRight = '';
    box.style.removeProperty('--shift');
    box.style.removeProperty('--dur');
    const over = text.scrollWidth - box.clientWidth;
    if (over > 4) {
      box.classList.add('marquee');
      // 왼쪽은 다른 제목과 같은 위치(패딩 0)에서 시작한다. 오른쪽 끝 글자만 오른쪽 페이드에
      // 가리지 않도록 FADE 만큼 여유를 주고, 그만큼 더 스크롤해 끝까지 보이게 한다.
      text.style.paddingRight = FADE + 'px';
      const shift = over + FADE; // 오른쪽 패딩을 더한 뒤의 실제 넘침폭(= 새 scrollWidth - clientWidth)
      box.style.setProperty('--shift', shift + 'px');
      box.style.setProperty('--dur', Math.max(2.5, shift / 22).toFixed(1) + 's');
    }
  }

  // ── 설정 모달(사이드바) ──────────────────────
  function fillSettings() {
    const s = state.settings;
    $('#setNotify').checked = s.notifyEnabled !== false;
    $('#setNotifyOff').checked = s.notifyOffline !== false;
    $('#setAutoOpen').checked = !!s.autoOpenLive;
    $('#setThumbs').checked = s.showThumbnails !== false;
    $('#setTray').checked = s.minimizeToTray !== false;
    $('#setStartup').checked = !!s.launchAtStartup;
    $('#setBeta').checked = !!s.betaChannel;
    $('#setInterval').value = String(s.pollIntervalSec || 60);
    $('#setLanguage').value = I18N.normalize(s.language) || 'ko';
    buildMemberList('#subList', s.subscribed, saveSubscriptions);
    buildMemberList('#autoOpenList', s.autoOpenList, saveAutoOpen);
    updateAutoOpenEnabled();
  }

  // 멤버 프로필 선택 목록 생성(알림/브라우저 공용)
  function buildMemberList(sel, selected, onChange) {
    const host = $(sel);
    if (!host) return;
    host.innerHTML = '';
    state.members.forEach((m) => {
      const on = selected == null || selected.includes(m.key);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mpick' + (on ? ' on' : '');
      btn.dataset.key = m.key;
      btn.style.setProperty('--card-accent', m.accent);
      btn.innerHTML = `
        <img class="mpick-ava" src="${esc(m.avatar || 'assets/logo_star.png')}" alt="">
        <span class="mpick-name">${esc(I18N.memberName(m))}</span>
        <span class="mpick-check">${icon('checkmark', 12)}</span>`;
      wireImgFallback(btn.querySelector('.mpick-ava'), 'assets/logo_star.png');
      btn.addEventListener('click', () => { btn.classList.toggle('on'); onChange(); });
      host.appendChild(btn);
    });
  }
  function collectKeys(sel) {
    const items = [...document.querySelectorAll(`${sel} .mpick`)];
    const checked = items.filter((b) => b.classList.contains('on')).map((b) => b.dataset.key);
    return checked.length === items.length ? null : checked; // 전부 = null(전체)
  }
  async function saveSubscriptions() { state.settings = await api.setSettings({ subscribed: collectKeys('#subList') }); }
  async function saveAutoOpen() { state.settings = await api.setSettings({ autoOpenList: collectKeys('#autoOpenList') }); }
  function updateAutoOpenEnabled() {
    const on = $('#setAutoOpen').checked;
    $('#autoOpenList').classList.toggle('disabled', !on);
  }

  function switchTab(tab) {
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  }

  function openSettings() {
    fillSettings();
    switchTab('general');
    const m = $('#settingsModal');
    m.hidden = false;
    void m.offsetHeight; // 리플로우 후 열기 애니메이션
    m.classList.add('open');
  }
  let closeTimer = null;
  function closeSettings() {
    const m = $('#settingsModal');
    if (m.hidden) return;
    m.classList.remove('open');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { m.hidden = true; }, 240); // 닫기 애니메이션 후 숨김
  }

  // 언어 변경 → 설정 저장 + 정적/동적 텍스트 전체 갱신
  async function applyLanguage(lang) {
    state.settings = await api.setSettings({ language: lang });
    I18N.setLang(lang);
    I18N.apply(document);       // data-i18n 정적 텍스트
    renderNow(false);           // 멤버 카드(이름/상태/버튼)
    renderSchedule(true);       // 스케줄(강제 재렌더)
    updateSummary();            // 상단 요약
    updateSurveyBanner();       // 설문 배너 문구(동적 텍스트)
    renderTerms();              // 이용약관 본문
    if (!$('#settingsModal').hidden) {
      buildMemberList('#subList', state.settings.subscribed, saveSubscriptions);
      buildMemberList('#autoOpenList', state.settings.autoOpenList, saveAutoOpen);
    }
    if (state.updateInfo && !$('#updateModal').hidden) openUpdateModal(state.updateInfo);
  }

  function wireSettings() {
    $('#btnSettings').addEventListener('click', openSettings);
    $('#setLanguage').addEventListener('change', (e) => applyLanguage(e.target.value));
    $('#closeSettings').addEventListener('click', closeSettings);
    $('#settingsModal').addEventListener('click', (e) => { if (e.target.id === 'settingsModal') closeSettings(); });
    document.querySelectorAll('.nav-item[data-tab]').forEach((n) => n.addEventListener('click', () => switchTab(n.dataset.tab)));

    // 라이브러리/출처 링크
    document.querySelectorAll('.lib-link').forEach((el) => el.addEventListener('click', () => openLink(el.dataset.url)));

    const save = async (patch) => (state.settings = await api.setSettings(patch));
    $('#setNotify').addEventListener('change', (e) => save({ notifyEnabled: e.target.checked }));
    $('#setNotifyOff').addEventListener('change', (e) => save({ notifyOffline: e.target.checked }));
    $('#btnTestNotify').addEventListener('click', async () => {
      let res;
      try { res = await api.testNotification(); } catch { res = null; }
      if (res && res.ok === false && res.reason === 'unsupported') {
        showToast({ icon: 'info', title: T('toast.notifyUnsupported'), duration: 4000 });
      } else if (res && res.ok === false) {
        // 전송은 시도했으나 OS 가 거부(예: 알림 권한 꺼짐) — 권한 확인을 안내한다.
        showToast({ icon: 'alert', title: T('toast.notifyBlocked'), desc: T('toast.notifyBlockedDesc'), duration: 6000 });
      } else {
        showToast({ icon: 'checkmark', title: T('toast.notifyTestSent'), desc: T('toast.notifyTestSentDesc'), duration: 4000 });
      }
    });
    $('#setAutoOpen').addEventListener('change', (e) => { save({ autoOpenLive: e.target.checked }); updateAutoOpenEnabled(); });
    $('#setThumbs').addEventListener('change', (e) => { save({ showThumbnails: e.target.checked }); render(); });
    $('#setTray').addEventListener('change', (e) => save({ minimizeToTray: e.target.checked }));
    $('#setStartup').addEventListener('change', (e) => save({ launchAtStartup: e.target.checked }));
    // 베타 채널 토글: 저장 후 곧바로 업데이트를 다시 확인해 새 채널 기준(정식/베타) 최신 버전을 안내한다.
    $('#setBeta').addEventListener('change', async (e) => {
      await save({ betaChannel: e.target.checked });
      state.manualUpdateCheck = true;
      api.checkUpdate();
    });
    $('#setInterval').addEventListener('change', (e) => save({ pollIntervalSec: Number(e.target.value) }));

    $('#btnCheckUpdate').addEventListener('click', () => { state.manualUpdateCheck = true; api.checkUpdate(); });
    $('#btnReport').addEventListener('click', () => openModalEl('#contactModal'));
    $('#btnCopyDiag').addEventListener('click', copyDiagnostics);
    $('#btnUninstall').addEventListener('click', () => api.uninstall());
  }

  // 오류 메시지 '복사' 버튼(위임) — 어디에 있든 .err-copy 를 누르면 data-copy 원문을 클립보드로.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('.err-copy');
    if (!btn) return;
    try { await api.copyToClipboard(btn.dataset.copy || ''); } catch { /* 실패해도 텍스트는 직접 선택·복사 가능 */ }
    showToast({ icon: 'checkmark', title: T('err.copied'), duration: 2000 });
  });

  // 진단 정보(버그 신고용)를 사람이 읽기 좋은 형태로 만들어 화면에 보여주고 클립보드로 복사한다.
  function friendlyOS(d) {
    const p = d.platform === 'darwin' ? 'macOS' : d.platform === 'win32' ? 'Windows' : (d.platform || '');
    return d.osVersion ? `${p} ${d.osVersion}` : p;
  }
  function friendlyArch(d) {
    if (d.arch === 'arm64') return d.platform === 'darwin' ? 'Apple Silicon (arm64)' : 'ARM64 (arm64)';
    if (d.arch === 'x64') return d.platform === 'darwin' ? 'Intel (x64)' : 'x64';
    return d.arch || '';
  }
  async function copyDiagnostics() {
    let d;
    try { d = await api.getDiagnostics(); } catch { return; }
    const channel = d.beta ? T('diag.channelBeta') : T('diag.channelStable');
    const text = [
      '### 앱 정보',
      `- 앱 버전: v${d.version}`,
      `- 채널: ${channel}`,
      '',
      '### 시스템 정보',
      `- 운영체제: ${friendlyOS(d)}`,
      `- 아키텍처: ${friendlyArch(d)}`,
      `- Electron: ${d.electron} · Chrome: ${d.chrome} · Node: ${d.node}`,
    ].join('\n');
    const box = $('#diagBox');
    if (box) { box.textContent = text; box.classList.add('show'); }
    try { await api.copyToClipboard(text); } catch { /* 복사 실패해도 위 상자에서 직접 복사 가능 */ }
    showToast({ icon: 'checkmark', title: T('diag.copied'), duration: 2200 });
  }

  // ── 업데이트 모달 ────────────────────────────
  function openUpdateModal(info) {
    state.updateInfo = info;
    state.installing = false;
    $('#umTitle').innerHTML = T('um.title', { v: esc('v' + (info.version || '')) });
    $('#umRepo').textContent = info.repo || '';
    $('#umNotes').innerHTML = mdToHtml(localizeNotes(info.notes) || T('notes.empty'));
    $('#umBadge').innerHTML = icon('download', 24);
    // 강제 업데이트: 취소 불가
    $('#umRequired').hidden = !info.mandatory;
    $('#umLater').hidden = !!info.mandatory;
    // 진행 상태 초기화
    $('#umBar').style.width = '0%';
    $('#umInstall').textContent = T('um.install');
    if (info.mandatory) {
      // 필수: 지금과 동일 — 자동으로 내려받는 중이며, 완료되면 설치가 활성화된다.
      $('#umProgText').textContent = T('um.downloading');
      $('#umProgress').hidden = false;
      $('#umInstall').disabled = true;
    } else {
      // 일반: [지금 설치]를 눌러야 다운로드가 시작된다. 진행바는 숨기고 버튼은 활성화.
      $('#umProgress').hidden = true;
      $('#umInstall').disabled = false;
    }
    const m = $('#updateModal');
    m.hidden = false;
    void m.offsetHeight;
    m.classList.add('open');
  }
  function closeUpdateModal() {
    if (state.updateInfo && state.updateInfo.mandatory) return; // 강제 업데이트는 닫기 불가
    // [나중에]/바깥 클릭으로 닫으면 이번 실행 동안은 다시 뜨지 않는다(완전 재시작 시에만 재알림).
    state.updateSnoozed = true;
    const m = $('#updateModal');
    m.classList.remove('open');
    setTimeout(() => (m.hidden = true), 240);
  }
  function setUpdateProgress(percent) {
    $('#umBar').style.width = (percent || 0) + '%';
    $('#umProgText').textContent = T('um.downloadingPct', { p: percent || 0 });
  }
  function updateReady() {
    $('#umBar').style.width = '100%';
    $('#umProgText').textContent = T('um.ready');
    $('#umInstall').disabled = false;
  }

  let checkingToastClose = null;
  function closeChecking() { if (checkingToastClose) { checkingToastClose(); checkingToastClose = null; } }

  function handleUpdate(payload) {
    const manual = state.manualUpdateCheck;
    switch (payload.state) {
      case 'checking':
        // 결과가 나오면 닫히도록 지속(duration 0). 자동 확인 때는 표시하지 않음.
        if (manual) checkingToastClose = showToast({ icon: 'refresh', title: T('toast.checking'), duration: 0, spin: true });
        break;
      case 'available':
        closeChecking();
        if (payload.mandatory) {
          // 필수 업데이트: 바로 강제 모달(취소 불가).
          openUpdateModal(payload);
        } else if (!(state.updateSnoozed && !manual)) {
          // 일반 업데이트: 필수가 아니어도 '업데이트가 있어요' 토스트로 알림(설치/닫기).
          //  - 설치: 업데이트 창을 연다.  - 닫기: 이번 실행 동안 다시 알리지 않음(스누즈).
          // ([나중에]로 미뤘고 자동 확인이면 표시하지 않음. 직접 [업데이트 확인] 시엔 표시)
          if (!document.querySelector('#toasts .update-toast')) {
            showToast({
              icon: 'download',
              className: 'update-toast',
              title: T('toast.updTitle'),
              desc: T('toast.updDesc', { v: payload.version || '' }),
              actionLabel: T('toast.updAction'),
              onAction: () => openUpdateModal(payload),
              onClose: () => { state.updateSnoozed = true; },
              duration: 0,
            });
          }
        }
        state.manualUpdateCheck = false;
        break;
      case 'downloading':
        if (!$('#updateModal').hidden) { $('#umProgress').hidden = false; setUpdateProgress(payload.percent); }
        break;
      case 'downloaded':
        closeChecking();
        if (state.installing) {
          // [지금 설치]로 시작한 다운로드가 끝난 경우 — 곧 인스톨러로 넘어간다.
          // 인스톨러가 압축 해제/부팅되는 몇 초 동안 이 창이 그대로 떠 있으므로,
          // 빈 화면처럼 보이지 않게 '준비 중' 안내를 유지한다.
          $('#umProgress').hidden = false;
          $('#umBar').style.width = '100%';
          $('#umProgText').textContent = T('um.preparing');
        } else {
          // 필수 업데이트의 자동 다운로드 완료 — 설치 버튼 활성화.
          if ($('#updateModal').hidden) openUpdateModal(payload);
          updateReady();
        }
        state.manualUpdateCheck = false;
        break;
      case 'mac-manual':
        // 맥: .dmg 를 열었으니 사용자가 직접 Applications 로 드래그해 교체하도록 안내.
        // (버튼은 재시도용으로 유지 — 다시 누르면 .dmg 를 다시 연다)
        state.installing = false;
        if (state.updateInfo && !$('#updateModal').hidden) {
          $('#umProgress').hidden = false;
          $('#umBar').style.width = '100%';
          $('#umProgText').textContent = T('um.macManual');
          $('#umInstall').disabled = false;
          $('#umInstall').textContent = T('um.install');
        }
        state.manualUpdateCheck = false;
        break;
      case 'manual-download':
        // 인앱 다운로드가 계속 실패해 브라우저 '직접 받기'로 폴백한 경우.
        state.installing = false;
        if (state.updateInfo && !$('#updateModal').hidden) {
          $('#umProgress').hidden = false;
          $('#umBar').style.width = '100%';
          $('#umProgText').textContent = T('um.manualDownload');
          $('#umInstall').disabled = false;
          $('#umInstall').textContent = T('um.retry');
        }
        showToast({ icon: 'download', title: T('toast.browserOpen'), desc: T('toast.browserOpenDesc'), duration: 6000 });
        state.manualUpdateCheck = false;
        break;
      case 'none':
        closeChecking();
        if (manual) showToast({ icon: 'check', title: T('toast.latest'), duration: 3500 });
        state.manualUpdateCheck = false;
        break;
      case 'dev':
        closeChecking();
        if (manual) showToast({ icon: 'alert', title: T('toast.dev'), duration: 4000 });
        state.manualUpdateCheck = false;
        break;
      case 'error': {
        closeChecking();
        state.installing = false;
        // 업데이트 모달이 열려 있는 상태(다운로드 중 실패 등)라면 창을 닫지 말고,
        // 실패를 표시한 뒤 [지금 설치]로 다시 시도할 수 있게 버튼을 복구한다.
        // (필수 업데이트도 여기서 재시도 가능 — "내려받는 중"에서 멈추지 않는다.)
        const modalOpen = state.updateInfo && !$('#updateModal').hidden;
        if (modalOpen) {
          $('#umProgress').hidden = false;
          $('#umBar').style.width = '0%';
          $('#umProgText').textContent = T('um.dlFail');
          $('#umInstall').disabled = false;
          $('#umInstall').textContent = T('um.install');
        }
        showToast({ icon: 'alert', title: modalOpen ? T('toast.dlErr') : T('toast.checkErr'), desc: manual || modalOpen ? T('toast.netHint') : '', duration: 5000 });
        state.manualUpdateCheck = false;
        break;
      }
    }
  }

  function wireUpdateModal() {
    $('#umInstall').addEventListener('click', () => {
      state.installing = true;
      $('#umInstall').disabled = true;
      $('#umInstall').textContent = T('um.installing');
      // 일반 업데이트는 이때부터 다운로드가 시작되므로 진행바를 노출한다.
      $('#umProgress').hidden = false;
      $('#umBar').style.width = '0%';
      $('#umProgText').textContent = T('um.downloading');
      api.installUpdate();
    });
    $('#umLater').addEventListener('click', closeUpdateModal);
    $('#updateModal').addEventListener('click', (e) => { if (e.target.id === 'updateModal') closeUpdateModal(); });
    $('#umLink').addEventListener('click', () => state.updateInfo && openLink(state.updateInfo.htmlUrl));
  }

  // ── 공용 모달 열기/닫기(애니메이션) ───────────
  function openModalEl(sel) { const m = $(sel); m.hidden = false; void m.offsetHeight; m.classList.add('open'); }
  // 캘린더는 아래로 슬라이드하는 시간(.36s)에 맞춰 조금 더 늦게 감춘다.
  function closeModalEl(sel) { const m = $(sel); m.classList.remove('open'); setTimeout(() => (m.hidden = true), (sel === '#calModal' || sel === '#surveyModal') ? 380 : 240); }

  // ── 문의하기(이메일 · GitHub 이슈 · X) ────────
  function wireContact() {
    const CONTACT = {
      email: 'mailto:contact@stellarium.kr?subject=' + encodeURIComponent('[스텔라상태] 문의'),
      github: 'https://github.com/tabiluv/stellastatus_app/issues/new',
      x: 'https://x.com/tabi_1uv',
    };
    const xSub = $('#coXsub'); if (xSub) xSub.textContent = '@tabi_1uv';
    $('#btnContact').addEventListener('click', () => openModalEl('#contactModal'));
    $('#closeContact').addEventListener('click', () => closeModalEl('#contactModal'));
    $('#contactModal').addEventListener('click', (e) => { if (e.target.id === 'contactModal') closeModalEl('#contactModal'); });
    document.querySelectorAll('.contact-opt').forEach((b) =>
      b.addEventListener('click', () => { openLink(CONTACT[b.dataset.contact]); closeModalEl('#contactModal'); }),
    );
  }

  // ── 업데이트 기록 ────────────────────────────
  async function openChangelog() {
    openModalEl('#changelogModal');
    const modal = document.querySelector('.changelog-modal');
    const host = $('#clList');
    host.innerHTML = `<div class="cl-loading"><span class="cl-spinner"></span><span>${esc(T('changelog.loading'))}</span></div>`;
    const [cur, rels] = await Promise.all([api.getVersion(), api.getChangelog()]);

    // FLIP: 로딩 상태 높이 → 내용 채운 뒤 높이로 부드럽게 전환(위·아래로 늘어남)
    const fromH = modal.getBoundingClientRect().height;
    if (!rels || !rels.length) {
      host.innerHTML = `<div class="cl-error">${errorBoxHtml(T('changelog.error'))}</div>`;
    } else {
      host.innerHTML = '';
      renderChangelogItems(host, rels, cur);
    }
    modal.style.height = 'auto';
    const toH = modal.getBoundingClientRect().height;
    modal.style.height = fromH + 'px';
    void modal.offsetHeight; // 리플로우
    modal.style.height = toH + 'px';
    setTimeout(() => { modal.style.height = ''; }, 440);
  }

  function renderChangelogItems(host, rels, cur) {
    rels.forEach((r) => {
      const isCur = r.version === cur;
      const el = document.createElement('div');
      el.className = 'cl-item' + (isCur ? ' current' : '');

      el.innerHTML = `
        <div class="cl-ver-row">
          <span class="cl-ver">v${esc(r.version)}</span>
          ${r.beta ? `<span class="cl-beta">${esc(T('changelog.beta'))}</span>` : ''}
          ${isCur ? `<span class="cl-now">${esc(T('changelog.now'))}</span>` : ''}
          <span class="cl-date">${esc(r.date || '')}</span>
        </div>
        <div class="cl-notes">${mdToHtml(localizeNotes(r.notes) || T('notes.empty'))}</div>`;
      host.appendChild(el);
    });
  }
  function wireChangelog() {
    $('#btnChangelog').addEventListener('click', openChangelog);
    $('#closeChangelog').addEventListener('click', () => closeModalEl('#changelogModal'));
    $('#changelogModal').addEventListener('click', (e) => { if (e.target.id === 'changelogModal') closeModalEl('#changelogModal'); });
  }
  // 이용약관 본문(언어별). 방송/데이터 관련 사실 관계는 동일하게 유지.
  const TERMS = {
    ko: `<p class="t-h">스텔라상태 이용약관</p>
<p><b>제1조 (목적 및 동의)</b><br>본 약관은 스텔라상태(이하 "앱")의 설치와 사용에 관한 조건을 정합니다. 이용자가 앱을 설치·실행함으로써 본 약관에 동의한 것으로 봅니다.</p>
<p><b>제2조 (라이선스)</b><br>앱은 MIT 라이선스로 제공되며, 개인적·비상업적 용도로 자유롭게 사용·복제·배포할 수 있습니다.</p>
<p><b>제3조 (사용 라이브러리 및 데이터)</b><br>앱은 오픈소스 라이브러리 stellastatus를 사용하여 방송 상태와 방송 스케줄(뱅온) 정보를 조회합니다. 해당 라이브러리는 치지직(CHZZK)의 방송 상태와 StelLight의 스케줄 등 공개 데이터를 기반으로 동작하며, 라이브러리 또는 원 서비스의 정책·구조 변경에 따라 일부 기능이 제한되거나 중단될 수 있습니다.</p>
<p><b>제4조 (비공식 고지)</b><br>본 앱은 스텔라이브 및 관련 서비스의 공식 제작물이 아닌, 팬이 제작한 비공식 도구입니다.</p>
<p><b>제5조 (책임의 제한)</b><br>앱은 "있는 그대로(as-is)" 제공됩니다. 제작자는 앱의 사용 또는 사용 불능으로 발생하는 어떠한 직접·간접 손해에 대해서도 책임지지 않습니다.</p>
<p><b>제6조 (개인정보)</b><br>앱은 이용자의 개인정보를 별도로 수집·전송하지 않으며, 모든 설정은 이용자의 PC에만 저장됩니다.</p>
<p><b>제7조 (자동 업데이트)</b><br>앱은 최신 버전 확인 및 업데이트 파일 다운로드를 위해 배포처(GitHub)에 접속할 수 있습니다.</p>
<p><b>제8조 (금지 행위)</b><br>데이터 출처 서버에 과도한 부하를 유발하는 개조·자동화·대량 요청 등의 행위를 금합니다.</p>
<p><b>제9조 (약관의 변경)</b><br>본 약관은 앱의 업데이트와 함께 변경될 수 있으며, 변경된 약관은 앱 내 정보 화면 또는 배포처를 통해 고지됩니다.</p>`,
    en: `<p class="t-h">StellaStatus Terms of Use</p>
<p><b>Article 1 (Purpose & Consent)</b><br>These terms govern the installation and use of StellaStatus (the "App"). By installing and running the App, you agree to these terms.</p>
<p><b>Article 2 (License)</b><br>The App is provided under the MIT License and may be freely used, copied, and distributed for personal, non-commercial purposes.</p>
<p><b>Article 3 (Libraries & Data)</b><br>The App uses the open-source library stellastatus to query stream status and schedule (bang-on) information. That library relies on public data such as CHZZK stream status and StelLight schedules; some features may be limited or stop working if those services change their policy or structure.</p>
<p><b>Article 4 (Unofficial Notice)</b><br>This App is an unofficial, fan-made tool and is not an official product of StelLive or related services.</p>
<p><b>Article 5 (Limitation of Liability)</b><br>The App is provided "as-is". The author is not liable for any direct or indirect damages arising from the use or inability to use the App.</p>
<p><b>Article 6 (Privacy)</b><br>The App does not separately collect or transmit your personal information; all settings are stored only on your PC.</p>
<p><b>Article 7 (Auto-update)</b><br>The App may connect to its distribution host (GitHub) to check for the latest version and download update files.</p>
<p><b>Article 8 (Prohibited Acts)</b><br>Modification, automation, or bulk requests that place excessive load on the data-source servers are prohibited.</p>
<p><b>Article 9 (Changes)</b><br>These terms may change with app updates; the revised terms are announced in the App's About screen or on the distribution host.</p>`,
    ja: `<p class="t-h">StellaStatus 利用規約</p>
<p><b>第1条 (目的および同意)</b><br>本規約は StellaStatus(以下「アプリ」)のインストールおよび使用条件を定めます。アプリをインストール・実行することで本規約に同意したものとみなします。</p>
<p><b>第2条 (ライセンス)</b><br>アプリは MIT ライセンスで提供され、個人的・非商用目的で自由に使用・複製・配布できます。</p>
<p><b>第3条 (使用ライブラリおよびデータ)</b><br>アプリはオープンソースライブラリ stellastatus を使用して配信状態と配信スケジュールを取得します。当該ライブラリは CHZZK の配信状態や StelLight のスケジュールなど公開データに基づいて動作し、ライブラリまたは元サービスの方針・構造の変更により一部機能が制限・停止する場合があります。</p>
<p><b>第4条 (非公式の告知)</b><br>本アプリはステラライブおよび関連サービスの公式制作物ではなく、ファンが制作した非公式ツールです。</p>
<p><b>第5条 (責任の制限)</b><br>アプリは「現状のまま(as-is)」提供されます。制作者はアプリの使用または使用不能により生じたいかなる直接・間接損害についても責任を負いません。</p>
<p><b>第6条 (個人情報)</b><br>アプリは利用者の個人情報を別途収集・送信せず、すべての設定は利用者の PC にのみ保存されます。</p>
<p><b>第7条 (自動更新)</b><br>アプリは最新バージョンの確認および更新ファイルのダウンロードのため配布元(GitHub)に接続する場合があります。</p>
<p><b>第8条 (禁止行為)</b><br>データ出典サーバーに過度な負荷をかける改造・自動化・大量リクエスト等の行為を禁止します。</p>
<p><b>第9条 (規約の変更)</b><br>本規約はアプリの更新に伴い変更される場合があり、変更後の規約はアプリ内の情報画面または配布元で告知されます。</p>`,
  };
  function renderTerms() {
    const el = $('#termsBody');
    if (el) el.innerHTML = TERMS[I18N.lang] || TERMS.ko;
  }

  function wireTerms() {
    renderTerms();
    $('#btnTerms').addEventListener('click', () => openModalEl('#termsModal'));
    $('#closeTerms').addEventListener('click', () => closeModalEl('#termsModal'));
    $('#termsModal').addEventListener('click', (e) => { if (e.target.id === 'termsModal') closeModalEl('#termsModal'); });
  }

  function wireSchedDetail() {
    $('#closeSched').addEventListener('click', () => closeModalEl('#schedModal'));
    $('#schedModal').addEventListener('click', (e) => { if (e.target.id === 'schedModal') closeModalEl('#schedModal'); });
  }

  // ── 이번 버전에서 바뀐 점(업데이트 후 첫 실행 1회) ──
  function wireWhatsNew() {
    $('#wnOk').addEventListener('click', () => closeModalEl('#whatsNewModal'));
    $('#whatsNewModal').addEventListener('click', (e) => { if (e.target.id === 'whatsNewModal') closeModalEl('#whatsNewModal'); });
  }
  // 현재 버전의 릴리스 노트를 모달로 보여준다. 노트를 못 찾으면 조용히 넘어간다.
  async function showWhatsNew(version) {
    let rels;
    try { rels = await api.getChangelog(); } catch { return; }
    const entry = (rels || []).find((r) => r.version === version);
    if (!entry) return;
    $('#wnVer').textContent = 'v' + version;
    $('#wnNotes').innerHTML = mdToHtml(localizeNotes(entry.notes) || T('notes.empty'));
    openModalEl('#whatsNewModal');
  }
  // 업데이트 후 첫 실행(저장된 버전 ≠ 현재 버전)이면 딱 1번 안내하고, 본 버전을 기록한다.
  // 최초 설치(저장된 버전 없음)에는 표시하지 않고 버전만 기록한다.
  async function maybeShowWhatsNew() {
    let cur;
    try { cur = await api.getVersion(); } catch { return; }
    if (!cur) return;
    const seen = state.settings.lastShownVersion;
    if (seen && seen !== cur) await showWhatsNew(cur);
    if (seen !== cur) { try { state.settings = await api.setSettings({ lastShownVersion: cur }); } catch { /* ignore */ } }
  }

  // ── 가로 스크롤(휠/드래그, 스크롤바 숨김) ──────
  function attachHScroll(el) {
    el.addEventListener('wheel', (e) => { if (e.deltaY !== 0) { el.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    let down = false, startX = 0, startLeft = 0, moved = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startLeft = el.scrollLeft; el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      el.scrollLeft = startLeft - dx;
    });
    const end = () => { if (!down) return; down = false; el.classList.remove('dragging'); if (moved) { el._suppressClick = true; setTimeout(() => (el._suppressClick = false), 0); } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => { if (el._suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // ── 배선 ────────────────────────────────────
  function wireToolbar() {
    $('#filterPills').addEventListener('click', (e) => {
      const p = e.target.closest('.pill');
      if (!p) return;
      document.querySelectorAll('.pill').forEach((x) => x.classList.remove('active'));
      p.classList.add('active');
      state.filter = p.dataset.filter;
      render(true);
    });
    let t;
    $('#searchInput').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.search = e.target.value.trim(); render(true); }, 120); });

    const refreshBtn = $('#btnRefresh');
    refreshBtn.addEventListener('click', async () => { refreshBtn.querySelector('svg')?.classList.add('spin'); await api.refresh(); });

    // 멤버는 세로 스크롤 그리드, 스케줄만 가로 스크롤(휠/드래그)
    attachHScroll($('#schedStrip'));
  }
  function wireWindowControls() {
    $('#winMin').addEventListener('click', () => api.minimize());
    $('#winMax').addEventListener('click', () => api.maximizeToggle());
    $('#winClose').addEventListener('click', () => api.close());
  }
  function installIcons() {
    setIcon('#btnRefresh', 'refresh', 16);
    setIcon('#btnSettings', 'settings', 16);
    setIcon('#searchIcon', 'search', 16);
    setIcon('#winMin', 'minus', 14);
    setIcon('#winMax', 'square', 13);
    setIcon('#winClose', 'x', 14);
    setIcon('#closeSettings', 'x', 14);
    setIcon('#closeContact', 'x', 14);
    setIcon('#closeChangelog', 'x', 14);
    setIcon('#closeTerms', 'x', 14);
    setIcon('#closeSched', 'x', 14);
    setIcon('#closeCal', 'x', 14);
    setIcon('#closeSurvey', 'x', 14);
    // data-icon 속성이 있는 요소(설정 사이드바, 링크 등) 일괄 채우기
    document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon, 16)));
  }

  // ── 초기화 ──────────────────────────────────
  let started = false;
  // 전역 오류가 UI 를 멈추지 않도록(안정성)
  window.addEventListener('error', (e) => console.error('렌더러 오류:', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('처리되지 않은 거부:', e.reason));

  async function init() {
    if (started) return;
    started = true;
    installIcons();
    wireToolbar();
    wireWindowControls();
    wireSettings();
    wireUpdateModal();
    wireContact();
    wireChangelog();
    wireTerms();
    wireSchedDetail();
    wireCalendar();
    wireSurvey();
    wireWhatsNew();

    state.settings = await api.getSettings();
    // 저장된 언어로 정적 텍스트 번역 적용(첫 렌더 전에)
    I18N.setLang(state.settings.language || 'ko');
    I18N.apply(document);
    state.members = (await api.getMembers()) || [];
    state.thumbStamp = Date.now();
    render();
    loadSchedule(); // 뱅온은 시작 시 1회 + 이후 1시간마다 재조회
    setInterval(loadSchedule, 60 * 60 * 1000);
    // 시간이 지나며 시작/종료가 바뀌는 것을 앱이 주기적으로 재판정(재요청 없음, 변화 있을 때만 다시 그림)
    setInterval(() => renderSchedule(), 30000);
    // 라이브 카드의 방송 경과 시간 1분마다 갱신(전체 리렌더 없이 텍스트만)
    setInterval(() => {
      document.querySelectorAll('.live-elapsed[data-open]').forEach((el) => {
        el.innerHTML = icon('clock', 12) + ' ' + esc(fmtUptime(+el.dataset.open));
      });
    }, 60000);
    // 릴리스 노트 등 마크다운 링크 클릭 → 외부 브라우저
    document.body.addEventListener('click', (e) => {
      const a = e.target.closest('.md-link');
      if (a) { e.preventDefault(); openLink(a.dataset.url); }
    });

    api.getVersion().then((v) => ($('#appVersion').textContent = 'v' + v));

    // 업데이트 후 첫 실행이면 이번 버전에서 바뀐 점을 딱 1번 안내한다.
    maybeShowWhatsNew();

    // 통합 설문 배너(진행 중 · 미참여 · 닫지 않음 일 때만) — 시작 시 1회 판단.
    updateSurveyBanner();

    api.onMembers((members) => {
      try {
        state.members = members || [];
        state.thumbStamp = Date.now();
        $('#btnRefresh').querySelector('svg')?.classList.remove('spin');
        render();
        renderSchedule(); // 라이브 상태 변화 반영(내부에서 변화 있을 때만 다시 그림)
        if (!$('#settingsModal').hidden) {
          buildMemberList('#subList', state.settings.subscribed, saveSubscriptions);
          buildMemberList('#autoOpenList', state.settings.autoOpenList, saveAutoOpen);
          updateAutoOpenEnabled();
        }
      } catch (err) {
        console.error('members 갱신 처리 오류:', err);
      }
    });
    api.onPolling((busy) => {
      const svg = $('#btnRefresh').querySelector('svg');
      if (svg) busy ? svg.classList.add('spin') : svg.classList.remove('spin');
    });
    // 방송 시작 → 인앱 플로팅 알림
    api.onLive((live) => {
      (live || []).forEach((m) =>
        showToast({ avatar: m.avatar, accent: m.accent, title: T('toast.liveTitle', { name: I18N.memberName(m) }), desc: m.title || T('toast.liveDesc'), url: m.liveUrl, duration: 7000 }),
      );
    });
    api.onUpdateStatus(handleUpdate);
  }

  window.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
