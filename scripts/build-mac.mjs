// macOS DMG 빌드 스크립트.
//
// 로컬(특히 iCloud/Dropbox 동기화 폴더)에서 안전하게 mac 패키지를 만들기 위한 두 가지 처리를 한다.
//
// 1) 비동기화 임시 경로(/private/tmp)로 빌드한다.
//    - 동기화 폴더 안에서 빌드하면 파일 프로바이더가 앱 하위 디렉터리에
//      com.apple.FinderInfo / com.apple.fileprovider 확장 속성을 붙여,
//      codesign 이 "resource fork ... detritus not allowed" 로 실패한다.
//
// 2) productName 을 ASCII("Stellarium")로 오버라이드한다.
//    - 한글 productName("스텔라리움")이면 헬퍼 앱이 "스텔라리움 Helper (GPU).app" 처럼
//      한글 경로가 되는데, 이 경우 앱이 헬퍼를 실행하는 순간 SIGTRAP 으로 크래시한다.
//    - .app/헬퍼/실행파일 이름은 ASCII 로 두고, 사용자에게 보이는 이름은
//      electron-builder.yml 의 mac.extendInfo.CFBundleDisplayName 으로 한글("스텔라리움")을 유지한다.
//    - Windows 빌드는 package.json 의 한글 productName 을 그대로 쓰므로 영향이 없다.
//
// 빌드가 끝나면 결과 DMG 를 프로젝트의 dist/ 로 복사한다.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'stella-mac-'));
const distDir = path.join(root, 'dist');

console.log(`• 빌드 출력(비동기화): ${outDir}`);
try {
  execFileSync(
    'npx',
    [
      'electron-builder',
      '--mac',
      '-c.productName=Stellarium',
      `-c.directories.output=${outDir}`,
    ],
    { cwd: root, stdio: 'inherit' }
  );

  mkdirSync(distDir, { recursive: true });
  const dmgs = readdirSync(outDir).filter((f) => f.endsWith('.dmg'));
  for (const f of dmgs) {
    copyFileSync(path.join(outDir, f), path.join(distDir, f));
    console.log(`• 복사됨 → dist/${f}`);
  }
  console.log(`\n✅ 완료: ${dmgs.length}개 DMG 를 dist/ 에 생성했습니다.`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
