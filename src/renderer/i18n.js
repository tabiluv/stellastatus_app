/* 스텔라상태 — 렌더러 다국어(i18n) 엔진 + 사전 (한국어/English/日本語)
 *
 * renderer.js 보다 먼저 로드된다(index.html). window.I18N 로 접근한다.
 *  - I18N.t(key, params)      : 현재 언어의 문자열(‘{n}’ 등 치환). 없으면 ko 폴백.
 *  - I18N.setLang(lang)       : 언어 변경(+ <html lang> 갱신)
 *  - I18N.apply(root)         : data-i18n / data-i18n-ph / data-i18n-title 요소 일괄 번역
 *  - I18N.genName(gen)        : 기수(1/2/3) 현지화 이름
 *  - I18N.memberName(m)       : 멤버 표시 이름(언어별). 방송 제목 등 '콘텐츠'는 번역하지 않는다.
 */
(function () {
  const SUPPORTED = ['ko', 'en', 'ja'];

  const STR = {
    ko: {
      'lang.name': '한국어',
      // 타이틀바
      'brand.name': '스텔라<b>상태</b>',
      'tb.refresh': '새로고침', 'tb.settings': '설정',
      'tb.min': '최소화', 'tb.max': '최대화', 'tb.close': '닫기',
      // 히어로
      'hero.eyebrow': 'STELLA STATUS · 스텔라이브 방송 알리미',
      'hero.title': '지금, 어떤 <b>스텔라</b>를 만나볼까요?',
      'summary.loading': '불러오는 중…',
      'summary.live': '지금 <b>{n}</b>명의 스텔라가 방송 중이에요',
      'summary.none': '지금은 모두 휴방 중이에요',
      // 툴바/필터
      'search.ph': '스텔라 이름으로 검색…',
      'filter.all': '전체', 'filter.live': '방송중',
      'filter.gen1': '에버리스', 'filter.gen2': '유니버스', 'filter.gen3': '클리셰',
      // 멤버 카드
      'empty.noMatch': '조건에 맞는 스텔라가 없어요.',
      'empty.loading': '스텔라 정보를 불러오는 중…',
      'card.liveDefault': '방송 중',
      'card.offErr': '상태를 불러오지 못했어요',
      'card.offIdle': '지금은 방송 중이 아니에요',
      'card.go': '라이브 바로가기',
      'card.wait': '방송 대기중',
      'up.just': '방금 시작', 'up.hm': '{h}시간 {m}분째', 'up.m': '{m}분째',
      'card.channel': '채널', 'card.social': '링크 보기',
      'card.pin': '상단 고정', 'card.unpin': '고정 해제',
      // 스케줄(뱅온)
      'sched.title': '오늘의 뱅온',
      'sched.loading': '스케줄을 불러오는 중…',
      'sched.error': '스케줄을 불러오지 못했어요.',
      'sched.empty': '오늘 등록된 뱅온 정보가 없어요.',
      'sched.started': '시작됨', 'sched.ended': '종료', 'sched.upcoming': '예정', 'sched.rest': '휴방',
      'sched.noinfo': '정보 없음', 'sched.noinfoDesc': '오늘 등록된 일정이 없어요.', 'cal.open': '캘린더로 보기',
      'cal.ice': '빙하기', 'cal.noSchedule': '일정이 없어요', 'cal.count': '개 일정',
      'err.copy': '오류 복사', 'err.copied': '오류 메시지를 복사했어요',
      'survey.bannerT': '스텔라상태 · 스텔라리움 통합에 관한 설문', 'survey.bannerD': '서비스 통합에 대한 파스텔분들의 의견을 알려주세요.', 'survey.bannerTVoted': '참여해 주셔서 감사드려요.', 'survey.bannerDVoted': '응답을 수정하거나 취소할 수 있어요.', 'survey.join': '참여하기', 'survey.edit': '응답 수정', 'survey.dismiss': '닫기',
      'schedD.time': '시각', 'schedD.plan': '뱅온', 'schedD.liveTitle': '방송 제목', 'schedD.category': '카테고리', 'schedD.viewers': '시청자',
      // 설정 공통
      'settings.title': '설정',
      'nav.general': '일반', 'nav.notify': '알림', 'nav.info': '정보', 'nav.contact': '문의하기',
      // 설정 - 일반
      'set.language.t': '언어 (Language)', 'set.language.d': '앱 화면에 표시되는 언어를 선택합니다.',
      'set.interval.t': '확인 주기', 'set.interval.d': '방송 상태를 확인하는 간격입니다.',
      'iv.30': '30초', 'iv.60': '1분', 'iv.120': '2분', 'iv.300': '5분',
      'set.thumbs.t': '썸네일 표시', 'set.thumbs.d': '방송 중인 카드에 미리보기를 표시합니다.',
      'set.tray.t': '닫을 때 트레이로 최소화', 'set.tray.d': 'X 를 눌러도 트레이에서 계속 실행됩니다.',
      'set.startup.t': '시작 시 자동 실행', 'set.startup.d': '부팅 시 트레이에서 자동으로 시작합니다.',
      'set.beta.t': '베타 버전 받기', 'set.beta.d': '정식 출시 전 베타(시험판)를 우선으로 받아 설치합니다.',
      // 설정 - 알림
      'set.notify.t': '방송 시작 알림', 'set.notify.d': '방송이 시작되면 시스템 알림을 보냅니다.',
      'set.notifyOff.t': '방송 종료 알림', 'set.notifyOff.d': '방송이 끝나면(방종) 시스템 알림을 보냅니다.',
      'set.notifyTest.t': '알림 테스트', 'set.notifyTest.d': '테스트 알림을 보냅니다. 알림이 보이지 않으면 시스템의 알림 권한을 확인해 주세요.', 'set.notifyTest.btn': '테스트',
      'toast.notifyTestSent': '테스트 알림을 보냈어요', 'toast.notifyTestSentDesc': '알림이 보이지 않으면 시스템 설정 → 알림에서 권한을 확인해 주세요.',
      'toast.notifyUnsupported': '이 시스템에서는 알림을 사용할 수 없어요',
      'toast.notifyBlocked': '알림이 차단되어 있어요', 'toast.notifyBlockedDesc': '시스템 설정 → 알림에서 스텔라상태의 알림을 허용해 주세요.',
      'set.subList.t': '알림 받을 스텔라', 'set.subList.d': '체크한 스텔라의 방송 시작만 알림을 받습니다.',
      'set.autoOpen.t': '방송 시작 시 브라우저로 열기', 'set.autoOpen.d': '방송이 시작되면 시스템 기본 웹브라우저로 자동으로 엽니다.',
      'set.autoOpenList.t': '브라우저로 열 스텔라', 'set.autoOpenList.d': '체크한 스텔라의 방송만 브라우저로 엽니다.',
      // 설정 - 정보
      'about.ver': '버전', 'about.made': 'Made by 스텔라리움',
      'btn.checkUpdate': '업데이트 확인', 'btn.changelog': '업데이트 기록', 'btn.terms': '이용약관',
      'label.dataSource': '데이터 출처', 'label.libs': '사용된 라이브러리', 'label.appManage': '앱 관리',
      'label.report': '문제 신고',
      'report.t': '문제 신고 · 문의', 'report.d': '버그 신고나 문의를 이메일 또는 GitHub 이슈로 보냅니다.', 'report.btn': '신고하기',
      'diag.t': '시스템 정보 복사', 'diag.d': '버그 신고 시 그대로 붙여넣을 수 있게 앱·시스템 정보를 복사합니다.',
      'diag.btn': '복사', 'diag.copied': '시스템 정보를 복사했어요',
      'diag.channelBeta': '베타(Beta)', 'diag.channelStable': '정식(Latest)',
      'lib.chzzk.d': '방송 상태', 'lib.stellight.d': '방송 스케줄(뱅온)',
      'lib.stellastatus.d': '스텔라이브 방송 상태·스케줄 조회',
      'lib.electron.d': '데스크톱 앱 프레임워크', 'lib.builder.d': '설치 파일 빌드·배포',
      'lib.updater.d': '자동 업데이트', 'lib.store.d': '설정 저장', 'lib.lucide.d': '아이콘 팩',
      'uninstall.t': '스텔라상태 제거', 'uninstall.d': '이 컴퓨터에서 앱과 바로가기를 삭제합니다.', 'uninstall.btn': '제거',
      // 업데이트 모달
      'um.title': '새 버전 <b>{v}</b> 이 나왔어요',
      'um.source': '출처: GitHub', 'um.viewRelease': '릴리스 보기',
      'um.downloading': '업데이트를 내려받는 중…',
      'um.downloadingPct': '업데이트를 내려받는 중… {p}%',
      'um.required': '안정성을 위한 필수 업데이트입니다.',
      'um.later': '나중에', 'um.install': '지금 설치', 'um.installing': '설치 중…', 'um.retry': '다시 시도',
      'um.ready': '설치 준비가 완료되었습니다.',
      'um.preparing': '업데이트를 준비하는 중이에요. 잠시만 기다려 주세요…',
      'um.macManual': '받은 설치 파일(.dmg)을 열었어요. 앱을 Applications 폴더로 드래그해 교체한 뒤 다시 실행해 주세요.',
      'um.manualDownload': '자동 내려받기에 실패해 브라우저에서 받기를 열었어요. 받은 설치 파일을 실행하면 업데이트됩니다.',
      'um.dlFail': '내려받기에 실패했어요. 다시 시도해 주세요.',
      'notes.empty': '(변경 내용 없음)',
      // 토스트
      'toast.checking': '업데이트를 확인하는 중…',
      'toast.updTitle': '업데이트가 있어요', 'toast.updDesc': 'v{v} 새 버전이 나왔어요.', 'toast.updAction': '설치',
      'toast.latest': '현재 최신 버전이에요',
      'toast.dev': '개발 모드에서는 업데이트를 확인할 수 없어요',
      'toast.browserOpen': '브라우저에서 받기를 열었어요', 'toast.browserOpenDesc': '받은 설치 파일을 실행하면 업데이트됩니다.',
      'toast.dlErr': '업데이트를 내려받지 못했어요', 'toast.checkErr': '업데이트를 확인할 수 없어요',
      'toast.netHint': '네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
      'toast.liveTitle': '🔴 {name} 방송 시작', 'toast.liveDesc': '치지직에서 라이브 중',
      // 문의하기
      'contact.title': '문의하기', 'contact.sub': '편한 방법으로 문의해 주세요.',
      'contact.email': '이메일', 'contact.github': 'GitHub 이슈', 'contact.githubSub': '버그 신고 · 기능 제안',
      'contact.x': 'X (트위터)',
      // 이용약관 / 업데이트 기록
      'terms.title': '이용약관', 'terms.h': '스텔라상태 이용약관',
      'changelog.title': '업데이트 기록', 'changelog.loading': '불러오는 중…',
      'changelog.error': '업데이트 기록을 불러오지 못했어요.', 'changelog.now': '현재', 'changelog.beta': '베타',
      'whatsnew.title': '이번 버전에서 바뀐 점', 'whatsnew.ok': '확인',
    },

    en: {
      'lang.name': 'English',
      'brand.name': 'Stella<b>Status</b>',
      'tb.refresh': 'Refresh', 'tb.settings': 'Settings',
      'tb.min': 'Minimize', 'tb.max': 'Maximize', 'tb.close': 'Close',
      'hero.eyebrow': 'STELLA STATUS · StelLive stream notifier',
      'hero.title': 'Which <b>Stella</b> will you meet today?',
      'summary.loading': 'Loading…',
      'summary.live': '<b>{n}</b> Stella streaming right now',
      'summary.none': 'Everyone is offline right now',
      'search.ph': 'Search by name…',
      'filter.all': 'All', 'filter.live': 'Live',
      'filter.gen1': 'Everys', 'filter.gen2': 'Universe', 'filter.gen3': 'Cliché',
      'empty.noMatch': 'No Stella match your filter.',
      'empty.loading': 'Loading Stella…',
      'card.liveDefault': 'Live now',
      'card.offErr': 'Couldn’t load status',
      'card.offIdle': 'Not streaming right now',
      'card.go': 'Watch live',
      'card.wait': 'Offline',
      'up.just': 'Just started', 'up.hm': '{h}h {m}m', 'up.m': '{m}m',
      'card.channel': 'Channel', 'card.social': 'Links',
      'card.pin': 'Pin to top', 'card.unpin': 'Unpin',
      'sched.title': 'Today’s Schedule',
      'sched.loading': 'Loading schedule…',
      'sched.error': 'Couldn’t load the schedule.',
      'sched.empty': 'No schedule registered for today.',
      'sched.started': 'Started', 'sched.ended': 'Ended', 'sched.upcoming': 'Upcoming', 'sched.rest': 'Off',
      'sched.noinfo': 'No info', 'sched.noinfoDesc': 'No schedule today.', 'cal.open': 'Calendar view',
      'cal.ice': 'Streaming break', 'cal.noSchedule': 'No schedule', 'cal.count': ' events',
      'err.copy': 'Copy error', 'err.copied': 'Error message copied',
      'survey.bannerT': 'Survey on merging StellaStatus & Stellarium', 'survey.bannerD': 'Share your thoughts on combining the services.', 'survey.bannerTVoted': 'Thanks for taking part.', 'survey.bannerDVoted': 'You can change or cancel your response.', 'survey.join': 'Take part', 'survey.edit': 'Edit response', 'survey.dismiss': 'Dismiss',
      'schedD.time': 'Time', 'schedD.plan': 'Bang-on', 'schedD.liveTitle': 'Live title', 'schedD.category': 'Category', 'schedD.viewers': 'Viewers',
      'settings.title': 'Settings',
      'nav.general': 'General', 'nav.notify': 'Notifications', 'nav.info': 'About', 'nav.contact': 'Contact',
      'set.language.t': 'Language (언어)', 'set.language.d': 'Choose the display language of the app.',
      'set.interval.t': 'Check interval', 'set.interval.d': 'How often to check stream status.',
      'iv.30': '30 sec', 'iv.60': '1 min', 'iv.120': '2 min', 'iv.300': '5 min',
      'set.thumbs.t': 'Show thumbnails', 'set.thumbs.d': 'Show a preview on live cards.',
      'set.tray.t': 'Minimize to tray on close', 'set.tray.d': 'Keeps running in the tray when you press X.',
      'set.startup.t': 'Launch on startup', 'set.startup.d': 'Starts automatically in the tray on boot.',
      'set.beta.t': 'Get beta versions', 'set.beta.d': 'Prefer and install pre-release (beta) builds before the stable release.',
      'set.notify.t': 'Stream start notifications', 'set.notify.d': 'Sends a system notification when a stream begins.',
      'set.notifyOff.t': 'Stream end alerts', 'set.notifyOff.d': 'Sends a notification when a stream ends.',
      'set.notifyTest.t': 'Test notification', 'set.notifyTest.d': 'Sends a test notification. If nothing appears, check your system notification permissions.', 'set.notifyTest.btn': 'Test',
      'toast.notifyTestSent': 'Test notification sent', 'toast.notifyTestSentDesc': 'If nothing appears, check System Settings → Notifications.',
      'toast.notifyUnsupported': 'Notifications aren’t available on this system',
      'toast.notifyBlocked': 'Notifications are blocked', 'toast.notifyBlockedDesc': 'Allow StellaStatus in System Settings → Notifications.',
      'set.subList.t': 'Notify me for', 'set.subList.d': 'Only get notified for the Stella you check.',
      'set.autoOpen.t': 'Open browser on stream start', 'set.autoOpen.d': 'Automatically opens your default browser when a stream begins.',
      'set.autoOpenList.t': 'Auto-open in browser for', 'set.autoOpenList.d': 'Only open the browser for the Stella you check.',
      'about.ver': 'Version', 'about.made': 'Made by Stellarium',
      'btn.checkUpdate': 'Check for updates', 'btn.changelog': 'Changelog', 'btn.terms': 'Terms',
      'label.dataSource': 'Data sources', 'label.libs': 'Libraries used', 'label.appManage': 'Manage app',
      'label.report': 'Report a problem',
      'report.t': 'Report · Contact', 'report.d': 'Send a bug report or inquiry by email or GitHub issue.', 'report.btn': 'Report',
      'diag.t': 'Copy system info', 'diag.d': 'Copies your app & system info so you can paste it into a bug report.',
      'diag.btn': 'Copy', 'diag.copied': 'System info copied',
      'diag.channelBeta': 'Beta', 'diag.channelStable': 'Stable (Latest)',
      'lib.chzzk.d': 'Stream status', 'lib.stellight.d': 'Stream schedule',
      'lib.stellastatus.d': 'StelLive stream status & schedule',
      'lib.electron.d': 'Desktop app framework', 'lib.builder.d': 'Installer build & release',
      'lib.updater.d': 'Auto-update', 'lib.store.d': 'Settings storage', 'lib.lucide.d': 'Icon pack',
      'uninstall.t': 'Uninstall StellaStatus', 'uninstall.d': 'Removes the app and shortcuts from this computer.', 'uninstall.btn': 'Uninstall',
      'um.title': 'Version <b>{v}</b> is available',
      'um.source': 'Source: GitHub', 'um.viewRelease': 'View release',
      'um.downloading': 'Downloading update…',
      'um.downloadingPct': 'Downloading update… {p}%',
      'um.required': 'This is a required update for stability.',
      'um.later': 'Later', 'um.install': 'Install now', 'um.installing': 'Installing…', 'um.retry': 'Retry',
      'um.ready': 'Ready to install.',
      'um.preparing': 'Preparing the update. Please wait a moment…',
      'um.macManual': 'Opened the downloaded .dmg. Drag the app into your Applications folder to replace it, then reopen.',
      'um.manualDownload': 'Auto-download failed, so the browser download was opened. Run the downloaded installer to update.',
      'um.dlFail': 'Download failed. Please try again.',
      'notes.empty': '(No changes)',
      'toast.checking': 'Checking for updates…',
      'toast.updTitle': 'Update available', 'toast.updDesc': 'v{v} is out.', 'toast.updAction': 'Install',
      'toast.latest': 'You’re on the latest version',
      'toast.dev': 'Updates can’t be checked in dev mode',
      'toast.browserOpen': 'Opened browser download', 'toast.browserOpenDesc': 'Run the downloaded installer to update.',
      'toast.dlErr': 'Couldn’t download the update', 'toast.checkErr': 'Couldn’t check for updates',
      'toast.netHint': 'Check your network and try again.',
      'toast.liveTitle': '🔴 {name} is live', 'toast.liveDesc': 'Live on CHZZK',
      'contact.title': 'Contact', 'contact.sub': 'Reach out however is easiest.',
      'contact.email': 'Email', 'contact.github': 'GitHub Issues', 'contact.githubSub': 'Bug reports · Feature ideas',
      'contact.x': 'X (Twitter)',
      'terms.title': 'Terms', 'terms.h': 'StellaStatus Terms of Use',
      'changelog.title': 'Changelog', 'changelog.loading': 'Loading…',
      'changelog.error': 'Couldn’t load the changelog.', 'changelog.now': 'Current', 'changelog.beta': 'BETA',
      'whatsnew.title': 'What’s new in this version', 'whatsnew.ok': 'Got it',
    },

    ja: {
      'lang.name': '日本語',
      'brand.name': 'Stella<b>Status</b>',
      'tb.refresh': '更新', 'tb.settings': '設定',
      'tb.min': '最小化', 'tb.max': '最大化', 'tb.close': '閉じる',
      'hero.eyebrow': 'STELLA STATUS · ステラライブ配信通知',
      'hero.title': '今日はどの<b>ステラ</b>に会いますか？',
      'summary.loading': '読み込み中…',
      'summary.live': '今 <b>{n}</b> 人のステラが配信中です',
      'summary.none': '今は全員お休み中です',
      'search.ph': '名前で検索…',
      'filter.all': 'すべて', 'filter.live': '配信中',
      'filter.gen1': 'エバリス', 'filter.gen2': 'ユニバース', 'filter.gen3': 'クリシェ',
      'empty.noMatch': '条件に合うステラがいません。',
      'empty.loading': 'ステラ情報を読み込み中…',
      'card.liveDefault': '配信中',
      'card.offErr': '状態を取得できませんでした',
      'card.offIdle': '今は配信していません',
      'card.go': 'ライブを見る',
      'card.wait': '配信待機中',
      'up.just': '開始したばかり', 'up.hm': '{h}時間{m}分経過', 'up.m': '{m}分経過',
      'card.channel': 'チャンネル', 'card.social': 'リンク',
      'card.pin': '上部に固定', 'card.unpin': '固定を解除',
      'sched.title': '今日の配信予定',
      'sched.loading': 'スケジュールを読み込み中…',
      'sched.error': 'スケジュールを取得できませんでした。',
      'sched.empty': '今日の配信予定はありません。',
      'sched.started': '開始', 'sched.ended': '終了', 'sched.upcoming': '予定', 'sched.rest': 'お休み',
      'sched.noinfo': '情報なし', 'sched.noinfoDesc': '今日の予定はありません。', 'cal.open': 'カレンダー表示',
      'cal.ice': '配信休止', 'cal.noSchedule': '予定がありません', 'cal.count': '件',
      'err.copy': 'エラーをコピー', 'err.copied': 'エラーメッセージをコピーしました',
      'survey.bannerT': 'ステラ状態・ステラリウム統合に関するアンケート', 'survey.bannerD': 'サービス統合について、パステルの皆さんのご意見をお聞かせください。', 'survey.bannerTVoted': 'ご参加ありがとうございます。', 'survey.bannerDVoted': '回答の変更・取り消しができます。', 'survey.join': '参加する', 'survey.edit': '回答を修正', 'survey.dismiss': '閉じる',
      'schedD.time': '時刻', 'schedD.plan': 'バンオン', 'schedD.liveTitle': '配信タイトル', 'schedD.category': 'カテゴリ', 'schedD.viewers': '視聴者',
      'settings.title': '設定',
      'nav.general': '一般', 'nav.notify': '通知', 'nav.info': '情報', 'nav.contact': 'お問い合わせ',
      'set.language.t': '言語 (Language)', 'set.language.d': 'アプリの表示言語を選択します。',
      'set.interval.t': '確認間隔', 'set.interval.d': '配信状態を確認する間隔です。',
      'iv.30': '30秒', 'iv.60': '1分', 'iv.120': '2分', 'iv.300': '5分',
      'set.thumbs.t': 'サムネイル表示', 'set.thumbs.d': '配信中のカードにプレビューを表示します。',
      'set.tray.t': '閉じたらトレイに最小化', 'set.tray.d': 'X を押してもトレイで実行し続けます。',
      'set.startup.t': '起動時に自動実行', 'set.startup.d': '起動時にトレイで自動的に開始します。',
      'set.beta.t': 'ベータ版を受け取る', 'set.beta.d': '正式リリース前のベータ（試験版）を優先して受け取り、インストールします。',
      'set.notify.t': '配信開始通知', 'set.notify.d': '配信が始まるとシステム通知を送ります。',
      'set.notifyOff.t': '配信終了通知', 'set.notifyOff.d': '配信が終わるとシステム通知を送ります。',
      'set.notifyTest.t': '通知テスト', 'set.notifyTest.d': 'テスト通知を送ります。通知が表示されない場合は、システムの通知許可を確認してください。', 'set.notifyTest.btn': 'テスト',
      'toast.notifyTestSent': 'テスト通知を送りました', 'toast.notifyTestSentDesc': '表示されない場合は、システム設定 → 通知で許可を確認してください。',
      'toast.notifyUnsupported': 'このシステムでは通知を利用できません',
      'toast.notifyBlocked': '通知がブロックされています', 'toast.notifyBlockedDesc': 'システム設定 → 通知で StellaStatus の通知を許可してください。',
      'set.subList.t': '通知を受け取るステラ', 'set.subList.d': 'チェックしたステラの配信開始のみ通知します。',
      'set.autoOpen.t': '配信開始時にブラウザで開く', 'set.autoOpen.d': '配信が始まると既定のブラウザで自動的に開きます。',
      'set.autoOpenList.t': 'ブラウザで開くステラ', 'set.autoOpenList.d': 'チェックしたステラの配信のみブラウザで開きます。',
      'about.ver': 'バージョン', 'about.made': 'Made by Stellarium',
      'btn.checkUpdate': '更新を確認', 'btn.changelog': '更新履歴', 'btn.terms': '利用規約',
      'label.dataSource': 'データ出典', 'label.libs': '使用ライブラリ', 'label.appManage': 'アプリ管理',
      'label.report': '問題を報告',
      'report.t': '問題を報告 · お問い合わせ', 'report.d': 'バグ報告やお問い合わせをメールまたは GitHub Issue で送ります。', 'report.btn': '報告する',
      'diag.t': 'システム情報をコピー', 'diag.d': 'バグ報告にそのまま貼り付けられるよう、アプリ・システム情報をコピーします。',
      'diag.btn': 'コピー', 'diag.copied': 'システム情報をコピーしました',
      'diag.channelBeta': 'ベータ(Beta)', 'diag.channelStable': '正式(Latest)',
      'lib.chzzk.d': '配信状態', 'lib.stellight.d': '配信スケジュール',
      'lib.stellastatus.d': 'ステラライブ配信状態・スケジュール取得',
      'lib.electron.d': 'デスクトップアプリ基盤', 'lib.builder.d': 'インストーラー生成・配布',
      'lib.updater.d': '自動更新', 'lib.store.d': '設定保存', 'lib.lucide.d': 'アイコンパック',
      'uninstall.t': 'StellaStatus を削除', 'uninstall.d': 'このPCからアプリとショートカットを削除します。', 'uninstall.btn': '削除',
      'um.title': '新しいバージョン <b>{v}</b> が公開されました',
      'um.source': '出典: GitHub', 'um.viewRelease': 'リリースを見る',
      'um.downloading': '更新を取得中…',
      'um.downloadingPct': '更新を取得中… {p}%',
      'um.required': '安定性のための必須アップデートです。',
      'um.later': 'あとで', 'um.install': '今すぐ更新', 'um.installing': '更新中…', 'um.retry': '再試行',
      'um.ready': 'インストールの準備ができました。',
      'um.preparing': '更新を準備しています。少々お待ちください…',
      'um.macManual': 'ダウンロードした .dmg を開きました。アプリを Applications フォルダにドラッグして置き換え、再度起動してください。',
      'um.manualDownload': '自動ダウンロードに失敗したため、ブラウザでのダウンロードを開きました。ダウンロードしたインストーラーを実行すると更新されます。',
      'um.dlFail': 'ダウンロードに失敗しました。もう一度お試しください。',
      'notes.empty': '(変更内容なし)',
      'toast.checking': '更新を確認中…',
      'toast.updTitle': '更新があります', 'toast.updDesc': 'v{v} が公開されました。', 'toast.updAction': '更新',
      'toast.latest': '最新バージョンです',
      'toast.dev': '開発モードでは更新を確認できません',
      'toast.browserOpen': 'ブラウザのダウンロードを開きました', 'toast.browserOpenDesc': 'ダウンロードしたインストーラーを実行すると更新されます。',
      'toast.dlErr': '更新を取得できませんでした', 'toast.checkErr': '更新を確認できませんでした',
      'toast.netHint': 'ネットワークを確認して再試行してください。',
      'toast.liveTitle': '🔴 {name} が配信開始', 'toast.liveDesc': 'CHZZK でライブ配信中',
      'contact.title': 'お問い合わせ', 'contact.sub': 'お好きな方法でご連絡ください。',
      'contact.email': 'メール', 'contact.github': 'GitHub Issues', 'contact.githubSub': 'バグ報告 · 機能提案',
      'contact.x': 'X (Twitter)',
      'terms.title': '利用規約', 'terms.h': 'StellaStatus 利用規約',
      'changelog.title': '更新履歴', 'changelog.loading': '読み込み中…',
      'changelog.error': '更新履歴を取得できませんでした。', 'changelog.now': '現在', 'changelog.beta': 'ベータ',
      'whatsnew.title': 'このバージョンの変更点', 'whatsnew.ok': 'OK',
    },
  };

  // 기수(gen) 현지화 이름
  const GEN = {
    ko: { 1: '에버리스', 2: '유니버스', 3: '클리셰' },
    en: { 1: 'Everys', 2: 'Universe', 3: 'Cliché' },
    ja: { 1: 'エバリス', 2: 'ユニバース', 3: 'クリシェ' },
  };

  let lang = 'ko';

  function normalize(l) {
    if (!l) return null;
    const s = String(l).toLowerCase();
    if (s.startsWith('ko')) return 'ko';
    if (s.startsWith('ja')) return 'ja';
    if (s.startsWith('en')) return 'en';
    return SUPPORTED.includes(s) ? s : null;
  }

  function interp(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
  }

  function t(key, params) {
    const table = STR[lang] || STR.ko;
    const s = table[key] != null ? table[key] : STR.ko[key];
    return s == null ? key : interp(s, params);
  }

  function genName(gen, fallback) {
    const g = (GEN[lang] || GEN.ko)[gen];
    return g != null ? g : (fallback || '');
  }

  // 멤버 표시 이름: ko=한국어(m.name), en/ja=로마자(nameEng) → 없으면 한국어.
  // (방송 제목 등 실시간 콘텐츠는 번역하지 않는다.)
  function memberName(m) {
    if (!m) return '';
    if (lang === 'ko') return m.name || m.nameEng || '';
    if (lang === 'ja') return m.nameJa || m.nameEng || m.name || '';
    return m.nameEng || m.name || '';
  }

  // data-i18n(텍스트) / data-i18n-html(HTML) / data-i18n-ph(placeholder) / data-i18n-title(title) 적용
  function apply(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    r.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    r.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    r.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  }

  function setLang(l) {
    const n = normalize(l);
    if (n) lang = n;
    document.documentElement.setAttribute('lang', lang);
    return lang;
  }

  window.I18N = {
    get lang() { return lang; },
    supported: SUPPORTED.slice(),
    t, genName, memberName, apply, setLang, normalize,
  };
})();
