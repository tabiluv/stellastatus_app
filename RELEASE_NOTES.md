<!-- i18n:ko -->
## 스텔라리움 v1.1.0

> v1.0.9 이후의 변경 사항을 담은 **정식(안정) 버전** 입니다.
> 사용 중 이상이 있으면 설정 → 정보 → **문제 신고** 로 알려주세요.

스텔라리움을 이용해주시는 분들께 진심으로 감사드립니다.

# 수정된 내용
- **창 이동 불가 오류 수정** — 저번 업데이트에서 화면을 확장하기 위해 상단 바 제거 업데이트를 진행하였으나, 그로 인해 창 드래그가 불가한 오류가 있었어요.
- **알림 및 브라우저로 보기 기능 통합** - 이제 기능을 제대로 이용하려면 스텔라리움에 로그인 해야해요. 1.1.0 이후부터 로컬 파일로 저장하던 알림 기능을 스텔라리움 웹과 연동하여 앱에서도 계정에 저장된 설정을 따라가도록 변경되었어요.
- **스텔라 브라우저 개발에 따른 업데이트 주기 변경** - 스텔라리움 앱의 기능을 포함한 파스텔 전용 "스텔라 브라우저"의 개발이 시작되며, 이에 따라 스텔라리움 앱의 업데이트 주기가 변동될 수 있어요. Webview 특성 상 웹의 업데이트에 따라 앱 또한 자동으로 적용되니 참고바랍니다.

### 설치 방법
**Windows**
1. Assets 에서 `스텔라리움 Setup.exe` 를 내려받아 실행합니다.
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
## Stellarium v1.1.0

> This is the **stable release** with the changes made since v1.0.9.
> If something looks off, please report it via Settings → About → Report a problem.

Thank you so much for using Stellarium.

# What's changed
- **Fixed: the window couldn't be moved** — the previous update removed the top bar to give you more screen, but that left the window impossible to drag. It's fixed now.
- **Notifications & "open in browser" unified** — to use these features properly, you now need to sign in to Stellarium. From 1.1.0, notification settings that used to be saved in local files are linked with Stellarium web, so the app follows the settings saved to your account.
- **Update cadence may change as the Stella Browser is developed** — work has begun on "Stella Browser," a Pastel-exclusive browser that includes the Stellarium app's features, so the Stellarium app's update cadence may shift accordingly. Note that, by the nature of a webview, web updates are applied to the app automatically as well.

### How to install
**Windows**
1. Download and run `스텔라리움 Setup.exe` from Assets.
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
## Stellarium v1.1.0

> v1.0.9 以降の変更を含む **正式（安定）版** です。
> 不具合があれば、設定 → 情報 → 問題を報告 からお知らせください。

Stellarium をご利用いただきありがとうございます。

# 変更内容
- **ウィンドウを移動できない不具合を修正** — 前回のアップデートで画面を広げるために上部バーを削除しましたが、その影響でウィンドウをドラッグできない不具合がありました。今回修正しました。
- **通知と「ブラウザで開く」機能の統合** — これらの機能をきちんと使うには、Stellarium へのログインが必要になりました。1.1.0 以降、これまでローカルファイルに保存していた通知設定を Stellarium ウェブと連携し、アプリでもアカウントに保存された設定に従うようになりました。
- **ステラブラウザの開発に伴う更新頻度の変更** — Stellarium アプリの機能を含むパステル専用「ステラブラウザ」の開発が始まり、それに伴い Stellarium アプリの更新頻度が変わる場合があります。Webview の特性上、ウェブの更新に合わせてアプリにも自動的に反映されますのでご了承ください。

### インストール方法
**Windows**
1. Assets から `스텔라리움 Setup.exe` をダウンロードして実行します。
2. インストーラーで言語を選び、案内に従って進めます。
3. SmartScreen の警告が出たら「詳細情報 → 実行」を押して進めてください。

**macOS**
1. チップに合った `.dmg` をダウンロードします（Apple Silicon → `-arm64.dmg`、Intel → `-x64.dmg`）。
2. 開いてアプリを `Applications` フォルダにドラッグします。
3. 「開発元を確認できません」の警告が出たら、システム設定 > プライバシーとセキュリティ > 最下部のセキュリティ セクションで**このまま開く**を押すとインストールできます。

### 動作環境
- **Windows** — Windows 10 以降（64ビット）
- **macOS** — macOS 12 (Monterey) 以降
