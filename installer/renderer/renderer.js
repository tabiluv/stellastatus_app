(() => {
  const api = window.setup;
  const I = window.SI18N;
  const T = (k) => I.t(k);
  const $ = (s) => document.querySelector(s);

  const state = { mode: 'install', step: 'welcome', dir: '', exePath: '', appName: '스텔라리움', version: '', lang: 'ko' };

  // 아이콘 팩(Lucide, MIT)
  const ICONS = {
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  };
  function icon(name, size = 18, draw = false) {
    const p = ICONS[name];
    if (!p) return '';
    return `<svg class="${draw ? 'ic-draw' : ''}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  }
  const setIcon = (sel, name, size) => { const el = $(sel); if (el) el.innerHTML = icon(name, size); };

  // 단계 정의(라벨은 렌더 시 현재 언어로 번역)
  const INSTALL_STEPS = [
    { key: 'welcome', lk: 'step.welcome' },
    { key: 'terms', lk: 'step.terms' },
    { key: 'location', lk: 'step.location' },
    { key: 'progress', lk: 'step.progress' },
    { key: 'finish', lk: 'step.finish' },
  ];
  const UNINSTALL_STEPS = [
    { key: 'welcome', lk: 'step.welcome' },
    { key: 'progress', lk: 'step.uninProgress' },
    { key: 'finish', lk: 'step.finish' },
  ];
  const steps = () => (state.mode === 'uninstall' ? UNINSTALL_STEPS : INSTALL_STEPS);

  function renderSteps() {
    const host = $('#steps');
    const list = steps();
    const curIdx = list.findIndex((s) => s.key === state.step);
    host.innerHTML = '';
    list.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'step' + (i === curIdx ? ' active' : '') + (i < curIdx ? ' done' : '');
      el.innerHTML = `<span class="num">${i < curIdx ? icon('check', 14) : i + 1}</span><span>${T(s.lk)}</span>`;
      host.appendChild(el);
    });
  }

  function show(step) {
    state.step = step;
    document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.dataset.step !== step));
    if (step === 'finish') $('#doneBadge').innerHTML = icon('check', 30, true); // 완료 체크 그려지는 애니메이션
    renderSteps();
    updateButtons();
  }

  function updateButtons() {
    const back = $('#btnBack'), next = $('#btnNext'), cancel = $('#btnCancel');
    back.hidden = true; next.hidden = false; cancel.hidden = false; next.disabled = false;
    if (state.mode === 'uninstall') {
      if (state.step === 'welcome') { next.textContent = T('btn.uninstall'); }
      else if (state.step === 'progress') { next.hidden = true; cancel.hidden = true; }
      else if (state.step === 'finish') { next.textContent = T('btn.done'); cancel.hidden = true; }
      return;
    }
    if (state.step === 'welcome') { next.textContent = T('btn.next'); }
    else if (state.step === 'terms') { back.hidden = false; next.textContent = T('btn.next'); next.disabled = !$('#optAgree').checked; }
    else if (state.step === 'location') { back.hidden = false; next.textContent = T('btn.install'); }
    else if (state.step === 'progress') { next.hidden = true; cancel.hidden = true; }
    else if (state.step === 'finish') { next.textContent = T('btn.done'); cancel.hidden = true; }
  }

  // ── 흐름 ─────────────────────────────────────
  async function onNext() {
    if (state.mode === 'uninstall') {
      if (state.step === 'welcome') return doUninstall();
      if (state.step === 'finish') return api.close();
      return;
    }
    if (state.step === 'welcome') return show('terms');
    if (state.step === 'terms') return $('#optAgree').checked && show('location');
    if (state.step === 'location') return doInstall();
    if (state.step === 'finish') return finishInstall();
  }

  async function doInstall() {
    show('progress');
    const res = await api.install({
      targetDir: state.dir,
      desktopShortcut: $('#optDesktop').checked,
      startMenuShortcut: $('#optStart').checked,
      language: state.lang, // 설치 시 선택한 언어를 앱 설정에 기록
    });
    if (!res.ok) {
      $('#progTitle').textContent = T('prog.installFail');
      $('#progText').textContent = res.error || T('prog.unknownErr');
      return;
    }
    state.exePath = res.exePath;
    show('finish');
  }

  function finishInstall() {
    if ($('#optRun').checked && state.exePath) api.launch(state.exePath);
    api.close();
  }

  async function doUninstall() {
    show('progress');
    $('#progTitle').textContent = T('prog.uninstalling');
    const res = await api.uninstall();
    $('#finishTitle').textContent = T('unin.doneTitle');
    $('#finishDesc').innerHTML = res.ok ? T('unin.doneOk') : (res.error || T('unin.doneFail'));
    $('#runRow').hidden = true;
    $('#doneBadge').style.display = res.ok ? '' : 'none';
    show('finish');
  }

  // ── 이벤트 ───────────────────────────────────
  $('#btnNext').addEventListener('click', onNext);
  $('#btnBack').addEventListener('click', () => {
    if (state.step === 'terms') show('welcome');
    else if (state.step === 'location') show('terms');
  });
  $('#optAgree').addEventListener('change', updateButtons);
  $('#btnCancel').addEventListener('click', () => api.close());
  $('#btnClose').addEventListener('click', () => api.close());
  setIcon('#btnMin', 'minus', 14);
  setIcon('#btnClose', 'x', 14);
  const renderBrowseBtn = () => { $('#btnBrowse').innerHTML = icon('folder', 15) + ' ' + T('btn.browse'); };
  renderBrowseBtn();
  $('#btnMin').addEventListener('click', () => api.minimize());
  $('#madeBy').addEventListener('click', () => api.openExternal('https://github.com'));
  $('#btnBrowse').addEventListener('click', async () => {
    const d = await api.chooseDir();
    if (d) { state.dir = d.endsWith(state.appName) ? d : `${d}\\${state.appName}`; $('#pathInput').value = state.dir; }
  });

  // 진행 상태 문구를 현재 언어로 만든다(코어는 phase 만 보내고 문구는 여기서 현지화).
  // 알 수 없는 phase 는 코어가 보낸 text(폴백)를 그대로 쓴다.
  function progStatusText(p) {
    switch (p.phase) {
      case 'prepare': return T('prog.preparing');
      case 'copy': return T('prog.st.copy') + (p.total ? ` (${p.done || 0}/${p.total})` : '');
      case 'register': return T('prog.st.register');
      case 'remove': return T('prog.st.remove');
      case 'cleanup': return T('prog.st.cleanup');
      case 'done': return '';
      default: return p.text || '';
    }
  }

  api.onProgress((p) => {
    $('#barFill').style.width = (p.percent || 0) + '%';
    $('#progText').textContent = progStatusText(p);
    if (state.mode === 'uninstall') $('#progTitle').textContent = T('prog.uninstalling');
    else if (state.mode === 'update') $('#progTitle').textContent = p.phase === 'done' ? T('prog.updated') : T('prog.updating');
    else $('#progTitle').textContent = p.phase === 'done' ? T('prog.installed') : T('prog.installing');
  });

  // 업데이트(무인) 모드 — 기존 설치 위치에 제자리 덮어쓰기 후 재실행
  async function runUpdate() {
    $('#progTitle').textContent = T('prog.updating');
    show('progress');
    const res = await api.install({ targetDir: state.dir, desktopShortcut: false, startMenuShortcut: false, update: true });
    if (!res.ok) {
      $('#progTitle').textContent = T('prog.updateFail');
      $('#progText').textContent = res.error || T('prog.unknownErr');
      return;
    }
    $('#progTitle').textContent = T('prog.updated');
    $('#progText').textContent = T('prog.runNew');
    api.launch(res.exePath);
    setTimeout(() => api.close(), 900);
  }

  api.onBoot((b) => {
    // 업데이트/제거 모드는 앱이 전달한 언어(--lang)로 맞춘다(설치 마법사 UI 를 앱 언어와 통일).
    if (b.lang) setLanguage(b.lang);
    state.mode = b.mode;
    state.appName = b.appName || '스텔라리움';
    state.version = b.version || '';
    state.dir = b.defaultDir || '';
    $('#pathInput').value = state.dir;
    $('#verText').textContent = 'v' + state.version;
    if (b.mode === 'update') {
      document.body.classList.add('update-mode');
      state.dir = b.targetDir || b.defaultDir || '';
      runUpdate();
      return;
    }
    if (b.mode === 'uninstall') applyUninstallText();
    show('welcome');
  });

  // 제거 모드 전용 텍스트(언어 변경 시에도 다시 적용)
  function applyUninstallText() {
    $('#sideSub').textContent = T('side.uninstall');
    $('.panel[data-step="welcome"] .p-title').textContent = T('unin.welTitle');
    $('.panel[data-step="welcome"] .p-desc').innerHTML = T('unin.welDesc');
    const feat = $('.panel[data-step="welcome"] .feature');
    if (feat) feat.style.display = 'none';
    $('.panel[data-step="welcome"] .p-hint').textContent = T('unin.hint');
  }

  // 전체 UI 를 현재 언어로 다시 그림
  function refreshI18n() {
    I.apply(document);              // data-i18n 정적 텍스트 + 약관 + 타이틀
    renderBrowseBtn();
    renderSteps();
    updateButtons();
    if (state.mode === 'uninstall') applyUninstallText();
  }

  // 언어 선택
  const langSel = $('#langSelect');
  function setLanguage(l) {
    state.lang = I.setLang(l);
    langSel.value = state.lang;
    refreshI18n();
  }
  langSel.addEventListener('change', (e) => setLanguage(e.target.value));

  // 초기 언어: 시스템 로캘 추정(사용자가 상단에서 바꿀 수 있음)
  setLanguage(I.norm(navigator.language) || 'ko');

  // preload boot 가 이미 왔을 수도 있으니 기본 렌더
  renderSteps();
  updateButtons();
})();
