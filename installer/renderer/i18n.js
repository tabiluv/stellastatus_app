/* 스텔라리움 설치 프로그램 — 다국어(한국어/English/日本語).
 * window.SI18N.{t, setLang, apply, lang} 로 사용. renderer.js 보다 먼저 로드된다. */
(function () {
  const SUPPORTED = ['ko', 'en', 'ja'];
  const S = {
    ko: {
      'tb.title': '스텔라리움 설치',
      'lang.label': '언어',
      'side.sub': '방송 알리미', 'side.uninstall': '제거',
      'side.unofficial': '본 서비스는 팬이 운영하는 비공식 서비스입니다.',
      'step.welcome': '시작', 'step.terms': '이용약관', 'step.location': '설치 위치',
      'step.progress': '설치 중', 'step.finish': '완료', 'step.uninProgress': '제거 중',
      'btn.next': '다음', 'btn.install': '설치', 'btn.uninstall': '제거',
      'btn.done': '완료', 'btn.back': '뒤로', 'btn.cancel': '취소', 'btn.browse': '찾아보기',
      'wel.title': '스텔라리움 설치',
      'wel.desc': '스텔라이브 멤버의 방송을 실시간으로 확인하고,<br>방송이 시작되면 알림을 보내주는 앱입니다.',
      'wel.f1': '실시간 방송 감지 & 알림', 'wel.f2': '멤버별 프로필 · 라이브 바로가기', 'wel.f3': '트레이 상주 · 자동 실행',
      'wel.hint': '[설치]를 누르면 설치를 시작합니다.',
      'terms.title': '이용약관', 'terms.agree': '위 이용약관을 모두 읽었으며 이에 동의합니다.',
      'loc.title': '설치 위치', 'loc.desc': '스텔라리움를 설치할 폴더를 선택하세요.',
      'loc.desktop': '바탕화면에 바로가기 만들기', 'loc.start': '시작 메뉴에 바로가기 만들기',
      'prog.installing': '설치하는 중…', 'prog.installed': '설치 완료',
      'prog.uninstalling': '제거하는 중…', 'prog.updating': '업데이트하는 중…', 'prog.updated': '업데이트 완료',
      'prog.preparing': '준비 중…', 'prog.installFail': '설치 실패', 'prog.updateFail': '업데이트 실패',
      'prog.unknownErr': '알 수 없는 오류', 'prog.runNew': '새 버전을 실행합니다…',
      'prog.st.copy': '파일 복사 중…', 'prog.st.register': '바로가기·등록 정보 만드는 중…',
      'prog.st.remove': '파일을 삭제하는 중…', 'prog.st.cleanup': '설치 폴더를 정리하는 중…',
      'fin.title': '설치 완료', 'fin.desc': '스텔라리움 설치가 완료되었습니다.<br>트레이에 상주하며 방송 시작을 알려드립니다.',
      'fin.run': '스텔라리움 지금 실행',
      'unin.welTitle': '스텔라리움 제거', 'unin.welDesc': '스텔라리움를 컴퓨터에서 제거합니다.<br>설치된 파일과 바로가기가 삭제됩니다.',
      'unin.hint': '[제거]를 누르면 제거를 시작합니다.',
      'unin.doneTitle': '제거 완료', 'unin.doneOk': '스텔라리움가 제거되었습니다.', 'unin.doneFail': '제거 중 오류가 발생했습니다.',
    },
    en: {
      'tb.title': 'Stellarium Setup',
      'lang.label': 'Language',
      'side.sub': 'Stream notifier', 'side.uninstall': 'Uninstall',
      'side.unofficial': 'This is an unofficial, fan-run service.',
      'step.welcome': 'Start', 'step.terms': 'Terms', 'step.location': 'Location',
      'step.progress': 'Installing', 'step.finish': 'Done', 'step.uninProgress': 'Removing',
      'btn.next': 'Next', 'btn.install': 'Install', 'btn.uninstall': 'Uninstall',
      'btn.done': 'Done', 'btn.back': 'Back', 'btn.cancel': 'Cancel', 'btn.browse': 'Browse',
      'wel.title': 'Install Stellarium',
      'wel.desc': 'Track StelLive members’ streams in real time and<br>get notified the moment a stream starts.',
      'wel.f1': 'Real-time detection & notifications', 'wel.f2': 'Per-member profiles · quick live links', 'wel.f3': 'Runs in the tray · launch on startup',
      'wel.hint': 'Press [Install] to begin.',
      'terms.title': 'Terms of Use', 'terms.agree': 'I have read and agree to the terms above.',
      'loc.title': 'Install location', 'loc.desc': 'Choose the folder to install Stellarium into.',
      'loc.desktop': 'Create a desktop shortcut', 'loc.start': 'Create a Start menu shortcut',
      'prog.installing': 'Installing…', 'prog.installed': 'Installation complete',
      'prog.uninstalling': 'Removing…', 'prog.updating': 'Updating…', 'prog.updated': 'Update complete',
      'prog.preparing': 'Preparing…', 'prog.installFail': 'Installation failed', 'prog.updateFail': 'Update failed',
      'prog.unknownErr': 'Unknown error', 'prog.runNew': 'Launching the new version…',
      'prog.st.copy': 'Copying files…', 'prog.st.register': 'Creating shortcuts…',
      'prog.st.remove': 'Removing files…', 'prog.st.cleanup': 'Cleaning up…',
      'fin.title': 'Installation complete', 'fin.desc': 'Stellarium has been installed.<br>It runs in the tray and notifies you when a stream starts.',
      'fin.run': 'Launch Stellarium now',
      'unin.welTitle': 'Uninstall Stellarium', 'unin.welDesc': 'Removes Stellarium from this computer.<br>Installed files and shortcuts will be deleted.',
      'unin.hint': 'Press [Uninstall] to begin.',
      'unin.doneTitle': 'Uninstall complete', 'unin.doneOk': 'Stellarium has been removed.', 'unin.doneFail': 'An error occurred while removing.',
    },
    ja: {
      'tb.title': 'Stellarium インストール',
      'lang.label': '言語',
      'side.sub': '配信通知', 'side.uninstall': '削除',
      'side.unofficial': '本サービスはファンが運営する非公式サービスです。',
      'step.welcome': '開始', 'step.terms': '利用規約', 'step.location': 'インストール先',
      'step.progress': 'インストール中', 'step.finish': '完了', 'step.uninProgress': '削除中',
      'btn.next': '次へ', 'btn.install': 'インストール', 'btn.uninstall': '削除',
      'btn.done': '完了', 'btn.back': '戻る', 'btn.cancel': 'キャンセル', 'btn.browse': '参照',
      'wel.title': 'Stellarium をインストール',
      'wel.desc': 'ステラライブメンバーの配信をリアルタイムで確認し、<br>配信が始まると通知するアプリです。',
      'wel.f1': 'リアルタイム検知 & 通知', 'wel.f2': 'メンバー別プロフィール · ライブへのリンク', 'wel.f3': 'トレイ常駐 · 自動起動',
      'wel.hint': '[インストール]を押すと開始します。',
      'terms.title': '利用規約', 'terms.agree': '上記の利用規約をすべて読み、同意します。',
      'loc.title': 'インストール先', 'loc.desc': 'Stellarium をインストールするフォルダを選択してください。',
      'loc.desktop': 'デスクトップにショートカットを作成', 'loc.start': 'スタートメニューにショートカットを作成',
      'prog.installing': 'インストール中…', 'prog.installed': 'インストール完了',
      'prog.uninstalling': '削除中…', 'prog.updating': '更新中…', 'prog.updated': '更新完了',
      'prog.preparing': '準備中…', 'prog.installFail': 'インストール失敗', 'prog.updateFail': '更新失敗',
      'prog.unknownErr': '不明なエラー', 'prog.runNew': '新しいバージョンを起動します…',
      'prog.st.copy': 'ファイルをコピー中…', 'prog.st.register': 'ショートカットを作成中…',
      'prog.st.remove': 'ファイルを削除中…', 'prog.st.cleanup': 'インストールフォルダを整理中…',
      'fin.title': 'インストール完了', 'fin.desc': 'Stellarium のインストールが完了しました。<br>トレイに常駐し、配信開始をお知らせします。',
      'fin.run': 'Stellarium を今すぐ実行',
      'unin.welTitle': 'Stellarium を削除', 'unin.welDesc': 'Stellarium をこのPCから削除します。<br>インストールされたファイルとショートカットが削除されます。',
      'unin.hint': '[削除]を押すと開始します。',
      'unin.doneTitle': '削除完了', 'unin.doneOk': 'Stellarium を削除しました。', 'unin.doneFail': '削除中にエラーが発生しました。',
    },
  };

  // 이용약관 본문(언어별) — 앱 본체와 동일 내용.
  const TERMS = {
    ko: `<p class="t-h">스텔라리움 이용약관</p>
<p><b>제1조 (목적 및 동의)</b><br>본 약관은 스텔라리움(이하 "앱")의 설치와 사용에 관한 조건을 정합니다. 이용자가 앱을 설치·실행함으로써 본 약관에 동의한 것으로 봅니다.</p>
<p><b>제2조 (라이선스)</b><br>앱은 MIT 라이선스로 제공되며, 개인적·비상업적 용도로 자유롭게 사용·복제·배포할 수 있습니다.</p>
<p><b>제3조 (사용 라이브러리 및 데이터)</b><br>앱은 오픈소스 라이브러리 <b>stellastatus</b>를 사용하여 방송 상태와 방송 스케줄(뱅온) 정보를 조회합니다. 라이브러리 또는 원 서비스의 정책·구조 변경에 따라 일부 기능이 제한될 수 있습니다.</p>
<p><b>제4조 (비공식 고지)</b><br>본 앱은 스텔라이브 및 관련 서비스의 공식 제작물이 아닌, 팬이 제작한 비공식 도구입니다.</p>
<p><b>제5조 (책임의 제한)</b><br>앱은 "있는 그대로(as-is)" 제공됩니다. 제작자는 앱의 사용 또는 사용 불능으로 발생하는 어떠한 손해에 대해서도 책임지지 않습니다.</p>
<p><b>제6조 (개인정보)</b><br>앱은 이용자의 개인정보를 별도로 수집·전송하지 않으며, 모든 설정은 이용자의 PC에만 저장됩니다.</p>
<p><b>제7조 (자동 업데이트)</b><br>앱은 최신 버전 확인 및 업데이트 파일 다운로드를 위해 배포처(GitHub)에 접속할 수 있습니다.</p>
<p><b>제8조 (금지 행위)</b><br>데이터 출처 서버에 과도한 부하를 유발하는 개조·자동화·대량 요청 등의 행위를 금합니다.</p>
<p><b>제9조 (약관의 변경)</b><br>본 약관은 앱의 업데이트와 함께 변경될 수 있으며, 변경된 약관은 배포처를 통해 고지됩니다.</p>`,
    en: `<p class="t-h">Stellarium Terms of Use</p>
<p><b>Article 1 (Purpose & Consent)</b><br>These terms govern the installation and use of Stellarium (the "App"). By installing and running the App, you agree to them.</p>
<p><b>Article 2 (License)</b><br>The App is provided under the MIT License and may be freely used, copied, and distributed for personal, non-commercial purposes.</p>
<p><b>Article 3 (Libraries & Data)</b><br>The App uses the open-source library <b>stellastatus</b> to query stream status and schedule info. Some features may be limited if those services change their policy or structure.</p>
<p><b>Article 4 (Unofficial Notice)</b><br>This App is an unofficial, fan-made tool and is not an official product of StelLive or related services.</p>
<p><b>Article 5 (Limitation of Liability)</b><br>The App is provided "as-is". The author is not liable for any damages arising from the use or inability to use the App.</p>
<p><b>Article 6 (Privacy)</b><br>The App does not separately collect or transmit your personal information; all settings are stored only on your PC.</p>
<p><b>Article 7 (Auto-update)</b><br>The App may connect to its distribution host (GitHub) to check for updates and download update files.</p>
<p><b>Article 8 (Prohibited Acts)</b><br>Modification, automation, or bulk requests that overload the data-source servers are prohibited.</p>
<p><b>Article 9 (Changes)</b><br>These terms may change with app updates; revised terms are announced on the distribution host.</p>`,
    ja: `<p class="t-h">Stellarium 利用規約</p>
<p><b>第1条 (目的および同意)</b><br>本規約は Stellarium(以下「アプリ」)のインストールおよび使用条件を定めます。アプリをインストール・実行することで同意したものとみなします。</p>
<p><b>第2条 (ライセンス)</b><br>アプリは MIT ライセンスで提供され、個人的・非商用目的で自由に使用・複製・配布できます。</p>
<p><b>第3条 (使用ライブラリおよびデータ)</b><br>アプリはオープンソースライブラリ <b>stellastatus</b> を使用して配信状態とスケジュールを取得します。元サービスの方針・構造変更により一部機能が制限される場合があります。</p>
<p><b>第4条 (非公式の告知)</b><br>本アプリはステラライブおよび関連サービスの公式制作物ではなく、ファンが制作した非公式ツールです。</p>
<p><b>第5条 (責任の制限)</b><br>アプリは「現状のまま(as-is)」提供されます。制作者はアプリの使用または使用不能により生じた損害について責任を負いません。</p>
<p><b>第6条 (個人情報)</b><br>アプリは利用者の個人情報を別途収集・送信せず、すべての設定は利用者の PC にのみ保存されます。</p>
<p><b>第7条 (自動更新)</b><br>アプリは更新確認および更新ファイルのダウンロードのため配布元(GitHub)に接続する場合があります。</p>
<p><b>第8条 (禁止行為)</b><br>データ出典サーバーに過度な負荷をかける改造・自動化・大量リクエスト等を禁止します。</p>
<p><b>第9条 (規約の変更)</b><br>本規約はアプリの更新に伴い変更される場合があり、変更後の規約は配布元で告知されます。</p>`,
  };

  let lang = 'ko';
  const norm = (l) => { const s = String(l || '').toLowerCase(); return s.startsWith('ja') ? 'ja' : s.startsWith('en') ? 'en' : s.startsWith('ko') ? 'ko' : (SUPPORTED.includes(s) ? s : null); };
  const t = (k) => { const tb = S[lang] || S.ko; return tb[k] != null ? tb[k] : (S.ko[k] != null ? S.ko[k] : k); };
  function apply(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    r.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    r.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
    const tb = document.querySelector('#termsBox'); if (tb) tb.innerHTML = TERMS[lang] || TERMS.ko;
    document.documentElement.setAttribute('lang', lang);
    document.title = t('tb.title');
  }
  function setLang(l) { const n = norm(l); if (n) lang = n; return lang; }
  window.SI18N = { get lang() { return lang; }, supported: SUPPORTED.slice(), t, apply, setLang, norm };
})();
