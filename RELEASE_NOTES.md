<!-- i18n:ko -->
## 스텔라상태 v1.0.7

> v1.0.6 이후의 변경 사항을 담은 **정식(안정) 버전** 입니다.
> 사용 중 이상이 있으면 설정 → 정보 → **문제 신고** 로 알려주세요.

스텔라상태를 이용해주시는 분들께 진심으로 감사드립니다.

# 수정된 내용
- **스텔라상태 · 스텔라리움 통합 설문** — 두 서비스의 통합안에 대한 설문을 추가했습니다.
- **스텔라리움 웹 캘린더 변경** — 이제 캘린더가 스텔라리움 캘린더를 이용합니다.
- **오늘의 뱅온 표시 개선** — 방송 중이 아닌 멤버의 새벽·이월 일정을 숨기지 않고 그대로 보여줍니다. (이월 처리는 지금 방송 중인 멤버에게만 적용)
- **와이파이 재연결 시 알림 중복 수정** — 인터넷이 끊겼다 다시 연결될 때, 이미 방송 중이던 멤버의 알림과 브라우저 자동 열기가 다시 발동하던 문제를 고쳤습니다.
- **오류 메시지 복사** — 오류가 나면 그 내용을 그대로 선택·복사해 신고할 수 있게 했습니다.

### 설치 방법
**Windows**
1. Assets 에서 `스텔라상태 Setup.exe` 를 내려받아 실행합니다.
2. 설치 마법사에서 언어를 고르고 안내를 따라 진행합니다.
3. SmartScreen 경고가 뜨면 "추가 정보 → 실행" 을 눌러 진행하세요.

**macOS**
1. 칩에 맞는 `.dmg` 를 내려받습니다. (Apple Silicon → `-arm64.dmg`, Intel → `-x64.dmg`)
2. 열어서 앱을 `Applications` 폴더로 드래그합니다.
3. "확인되지 않은 개발자" 경고가 뜨면 설정 > 보안 및 개인정보 보호 > 맨 하단 보안 섹션에서 **그래도 열기**를 눌러 설치할 수 있습니다.

### 지원 환경
- **Windows** — Windows 10 이상 (64비트)
- **macOS** — macOS 12 (Monterey) 이상

<!-- i18n:en -->
## StellaStatus v1.0.7

> This is the **stable release** with the changes made since v1.0.6.
> If something looks off, please report it via Settings → About → Report a problem.

Thank you so much for using StellaStatus.

# What's changed
- **StellaStatus · Stellarium merge survey** — added a survey on the plan to merge the two services.
- **Switched to the Stellarium web calendar** — the calendar now uses the Stellarium calendar.
- **Better “Today’s schedule”** — dawn/carried-over entries for members who aren’t live are no longer hidden; they show as usual. (Carry-over now applies only to members who are currently live.)
- **Fixed duplicate alerts on Wi-Fi reconnect** — notifications and browser auto-open no longer fire again for members who were already live when the connection drops and comes back.
- **Copyable error messages** — when an error occurs, you can select and copy its text to report it.

### How to install
**Windows**
1. Download and run `스텔라상태 Setup.exe` from Assets.
2. Pick a language in the installer and follow the steps.
3. If SmartScreen warns you, click “More info → Run anyway”.

**macOS**
1. Download the `.dmg` for your chip (Apple Silicon → `-arm64.dmg`, Intel → `-x64.dmg`).
2. Open it and drag the app into your `Applications` folder.
3. If you see an “unidentified developer” warning, go to System Settings > Privacy & Security > the Security section at the bottom and click **Open Anyway** to install it.

### Requirements
- **Windows** — Windows 10 or later (64-bit)
- **macOS** — macOS 12 (Monterey) or later

<!-- i18n:ja -->
## StellaStatus v1.0.7

> v1.0.6 以降の変更を含む **正式（安定）版** です。
> 不具合があれば、設定 → 情報 → 問題を報告 からお知らせください。

StellaStatus をご利用いただきありがとうございます。

# 変更内容
- **StellaStatus・Stellarium統合アンケート** — 2つのサービスの統合案についてのアンケートを追加しました。
- **Stellariumのウェブカレンダーに変更** — カレンダーがStellariumのカレンダーを利用するようになりました。
- **「今日の配信予定」の表示改善** — 配信中でないメンバーの深夜・繰り越しの予定を隠さず、そのまま表示します。（繰り越し処理は現在配信中のメンバーにのみ適用）
- **Wi-Fi 再接続時の通知重複を修正** — インターネットが切断・再接続したとき、すでに配信中だったメンバーの通知やブラウザ自動起動が再び発動する問題を修正しました。
- **エラーメッセージのコピー** — エラー時にその内容をそのまま選択・コピーして報告できるようにしました。

### インストール方法
**Windows**
1. Assets から `스텔라상태 Setup.exe` をダウンロードして実行します。
2. インストーラーで言語を選び、案内に従って進めます。
3. SmartScreen の警告が出たら「詳細情報 → 実行」を押して進めてください。

**macOS**
1. チップに合った `.dmg` をダウンロードします（Apple Silicon → `-arm64.dmg`、Intel → `-x64.dmg`）。
2. 開いてアプリを `Applications` フォルダにドラッグします。
3. 「開発元を確認できません」の警告が出たら、システム設定 > プライバシーとセキュリティ > 最下部のセキュリティ セクションで**このまま開く**を押すとインストールできます。

### 動作環境
- **Windows** — Windows 10 以降（64ビット）
- **macOS** — macOS 12 (Monterey) 以降
