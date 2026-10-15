// 커스텀 인스톨러(스텔라리움 Setup.exe) 빌드 오케스트레이션.
//  1) 메인 앱을 win-unpacked 로 패키징
//  2) 그 결과를 installer/payload 로 복사(설치할 본체)
//  3) installer 를 portable exe 로 빌드 → dist-installer/스텔라리움 Setup.exe
import { execSync } from 'node:child_process';
import { rmSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, cwd) => { console.log(`\n$ ${cmd}  (cwd=${cwd})`); execSync(cmd, { cwd, stdio: 'inherit' }); };

console.log('■ 1/3 메인 앱 패키징 (win-unpacked)');
run('npm run gen-icon && npm run gen-logos', ROOT);
run('npx electron-builder --dir', ROOT);

console.log('■ 2/3 payload 복사');
const payload = join(ROOT, 'installer', 'payload');
rmSync(payload, { recursive: true, force: true });
mkdirSync(payload, { recursive: true });
cpSync(join(ROOT, 'dist', 'win-unpacked'), payload, { recursive: true });

console.log('■ 3/3 인스톨러 빌드 (portable)');
const installerDir = join(ROOT, 'installer');
if (!existsSync(join(installerDir, 'node_modules'))) run('npm install --no-audit --no-fund', installerDir);
run('npx electron-builder', installerDir);

console.log('\n✅ 완료: dist-installer/스텔라리움 Setup.exe');
