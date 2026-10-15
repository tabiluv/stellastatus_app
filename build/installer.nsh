; 스텔라리움 — 설치 마법사 완전 커스텀(다크 테마 + 좌측 단계 사이드바)
; 시작 / 설치 위치 / 완료 페이지를 nsDialogs 로 새로 그린다.
; (설치 진행 페이지는 MUI 관리 페이지라 다크 색상만 적용)

; 지원 OS 판별용 표준 헤더(Windows 버전 / 64비트 여부)
!include WinVer.nsh
!include x64.nsh

; ── 다크 색상 ─────────────────────────────────
!ifdef MUI_BGCOLOR
  !undef MUI_BGCOLOR
!endif
!define MUI_BGCOLOR "221A1D"
!ifdef MUI_TEXTCOLOR
  !undef MUI_TEXTCOLOR
!endif
!define MUI_TEXTCOLOR "F3EEF0"
!define MUI_INSTFILESPAGE_COLORS "F3EEF0 221A1D"

Var StellaFontH
Var StellaFontT
Var DirText
Var StellaRunCheck

; 준비: 지원 OS 확인 → 사이드바 로고 추출 + 폰트 생성
!macro customInit
  ; 지원되지 않는 Windows 버전이면 안내 후 설치 중단.
  ;  - Electron 43(Chromium)은 Windows 10 이상(64비트)만 지원한다.
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "지원되지 않는 Windows 버전입니다.$\r$\n스텔라리움는 Windows 10 이상에서만 설치할 수 있습니다.$\r$\n$\r$\nThis version of Windows is not supported.$\r$\nStellarium requires Windows 10 or later."
    Quit
  ${EndIf}
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "지원되지 않는 시스템입니다.$\r$\n스텔라리움는 64비트 Windows 에서만 설치할 수 있습니다.$\r$\n$\r$\nThis system is not supported.$\r$\nStellarium requires 64-bit Windows."
    Quit
  ${EndIf}

  InitPluginsDir
  File "/oname=$PLUGINSDIR\sidebarLogo.bmp" "${BUILD_RESOURCES_DIR}\sidebarLogo.bmp"
  CreateFont $StellaFontH "$(^Font)" "15" "700"
  CreateFont $StellaFontT "$(^Font)" "9" "400"
!macroend

; 한 단계 라벨 (현재 단계면 강조)
!macro STELLA_STEP N CUR Y LABEL
  ${NSD_CreateLabel} 16u ${Y} 64u 13u "${N}   ${LABEL}"
  Pop $R3
  !if ${N} == ${CUR}
    SetCtlColors $R3 0xCDD3F6 0x2B2230
  !else
    SetCtlColors $R3 0x716B78 0x2B2230
  !endif
  SendMessage $R3 ${WM_SETFONT} $StellaFontT 1
!macroend

; 좌측 사이드바(배경 + 로고 + 단계)
!macro STELLA_SIDEBAR CUR
  ${NSD_CreateLabel} 0 0 86u 100% ""
  Pop $R0
  SetCtlColors $R0 0xF3EEF0 0x2B2230
  ${NSD_CreateBitmap} 23u 18u 40u 48u ""
  Pop $R1
  ${NSD_SetImage} $R1 "$PLUGINSDIR\sidebarLogo.bmp" $R9
  ${NSD_CreateLabel} 8u 76u 72u 12u "스텔라리움"
  Pop $R2
  SetCtlColors $R2 0xCDD3F6 0x2B2230
  !insertmacro STELLA_STEP 1 ${CUR} 112u "시작"
  !insertmacro STELLA_STEP 2 ${CUR} 136u "설치 위치"
  !insertmacro STELLA_STEP 3 ${CUR} 160u "설치 중"
  !insertmacro STELLA_STEP 4 ${CUR} 184u "완료"
!macroend

; ── 시작 페이지 ───────────────────────────────
!macro customWelcomePage
  Function StellaWelcomeCreate
    nsDialogs::Create 1018
    Pop $0
    SetCtlColors $0 0xF3EEF0 0x221A1D
    !insertmacro STELLA_SIDEBAR 1
    ${NSD_CreateLabel} 104u 40u 185u 22u "스텔라리움 설치"
    Pop $1
    SetCtlColors $1 0xF3EEF0 0x221A1D
    SendMessage $1 ${WM_SETFONT} $StellaFontH 1
    ${NSD_CreateLabel} 104u 74u 190u 90u "스텔라이브 멤버의 방송을 실시간으로 확인하고,$\r$\n방송이 시작되면 윈도우 알림을 보내주는 앱입니다.$\r$\n$\r$\n[다음]을 눌러 설치를 시작하세요."
    Pop $2
    SetCtlColors $2 0xB8ABB0 0x221A1D
    nsDialogs::Show
  FunctionEnd
  Page custom StellaWelcomeCreate
!macroend

; ── 설치 위치 페이지(커스텀) ──────────────────
!macro customPageAfterChangeDir
  Function StellaDirBrowse
    ${NSD_GetText} $DirText $0
    nsDialogs::SelectFolderDialog "설치 위치 선택" "$0"
    Pop $1
    ${If} $1 != error
      ${NSD_SetText} $DirText "$1"
    ${EndIf}
  FunctionEnd
  Function StellaDirLeave
    ${NSD_GetText} $DirText $INSTDIR
  FunctionEnd
  Function StellaDirCreate
    nsDialogs::Create 1018
    Pop $0
    SetCtlColors $0 0xF3EEF0 0x221A1D
    !insertmacro STELLA_SIDEBAR 2
    ${NSD_CreateLabel} 104u 34u 190u 20u "설치 위치 선택"
    Pop $1
    SetCtlColors $1 0xF3EEF0 0x221A1D
    SendMessage $1 ${WM_SETFONT} $StellaFontH 1
    ${NSD_CreateLabel} 104u 64u 195u 26u "스텔라리움를 설치할 폴더를 선택하세요."
    Pop $2
    SetCtlColors $2 0xB8ABB0 0x221A1D
    ${NSD_CreateText} 104u 98u 150u 15u "$INSTDIR"
    Pop $DirText
    SetCtlColors $DirText 0xF3EEF0 0x2B2230
    ${NSD_CreateButton} 259u 97u 36u 17u "찾기"
    Pop $3
    SetCtlColors $3 0xF3EEF0 0x3A2E33
    ${NSD_OnClick} $3 StellaDirBrowse
    nsDialogs::Show
  FunctionEnd
  Page custom StellaDirCreate StellaDirLeave
!macroend

; ── 완료 페이지 ───────────────────────────────
!macro customFinishPage
  Function StellaFinishLeave
    ${NSD_GetState} $StellaRunCheck $0
    ${If} $0 == ${BST_CHECKED}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
    ${EndIf}
  FunctionEnd
  Function StellaFinishCreate
    nsDialogs::Create 1018
    Pop $0
    SetCtlColors $0 0xF3EEF0 0x221A1D
    !insertmacro STELLA_SIDEBAR 4
    ${NSD_CreateLabel} 104u 40u 190u 20u "설치 완료"
    Pop $1
    SetCtlColors $1 0xF3EEF0 0x221A1D
    SendMessage $1 ${WM_SETFONT} $StellaFontH 1
    ${NSD_CreateLabel} 104u 72u 195u 44u "스텔라리움 설치가 완료되었습니다.$\r$\n트레이에 상주하며 방송 시작을 알려드립니다."
    Pop $2
    SetCtlColors $2 0xB8ABB0 0x221A1D
    ${NSD_CreateCheckbox} 104u 122u 190u 14u "스텔라리움 지금 실행"
    Pop $StellaRunCheck
    SetCtlColors $StellaRunCheck 0xF3EEF0 0x221A1D
    ${NSD_Check} $StellaRunCheck
    nsDialogs::Show
  FunctionEnd
  Page custom StellaFinishCreate StellaFinishLeave
!macroend
