// 로컬 서버판 한 번에 띄우기: 서버(+DB) → 시험 데이터 → 화면(서버 연결판).
//   npm run local            Docker가 돌고 있으면 서버+PostgreSQL을 컨테이너로, 아니면 서버 jar를 직접(H2 파일 DB)
//   npm run local -- --h2    Docker가 있어도 H2로
//   npm run local -- --no-seed
// Ctrl+C로 끄면 화면과 서버를 같이 끈다. 컨테이너는 남겨 두며 `npm run local:stop`으로 끈다.

import { execSync, spawn } from 'node:child_process';
import { openSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const API = 'http://127.0.0.1:8080';
const WEB_PORT = 5174;
const args = new Set(process.argv.slice(2));
const children = [];

const log = (msg) => console.log(`\x1b[36m[로컬]\x1b[0m ${msg}`);

function dockerReady() {
  if (args.has('--h2')) return false;
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function serverUp() {
  try {
    return (await fetch(`${API}/api/health`)).ok;
  } catch {
    return false;
  }
}

async function waitForServer(seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await serverUp()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function startServer() {
  if (dockerReady()) {
    log('Docker로 서버와 PostgreSQL을 띄웁니다 (처음에는 이미지를 만드느라 몇 분 걸립니다).');
    execSync('docker compose up -d --build', { cwd: `${ROOT}server`, stdio: 'inherit' });
    return 'docker';
  }
  log('Docker가 돌고 있지 않아 서버를 직접 띄웁니다 (DB는 server/data의 H2 파일). 먼저 서버를 묶습니다…');
  // Gradle 데몬이 띄운 서버는 끌 때 따라 꺼지지 않으므로, jar로 묶어 직접 띄운다.
  execSync('./gradlew bootJar -q', { cwd: `${ROOT}server`, stdio: 'inherit' });
  const jar = readdirSync(`${ROOT}server/build/libs`).find((f) => f.endsWith('.jar') && !f.endsWith('-plain.jar'));
  const logFile = `${ROOT}server/build/local-server.log`;
  log(`서버 기록: ${logFile}`);
  const out = openSync(logFile, 'w');
  // 서버 포트는 8080으로 못 박는다 (바깥에서 PORT를 넘겨받아도 화면 포트와 겹치지 않게).
  const env = { ...process.env, PORT: '8080' };
  const java = process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : 'java';
  const p = spawn(java, ['-jar', `build/libs/${jar}`], { cwd: `${ROOT}server`, stdio: ['ignore', out, out], detached: true, env });
  children.push(p);
  return 'h2';
}

function startWeb() {
  log(`화면을 띄웁니다: http://127.0.0.1:${WEB_PORT}`);
  const p = spawn('npm', ['run', 'dev', '-w', '@nss/web', '--', '--port', String(WEB_PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: API },
    detached: true,
  });
  children.push(p);
}

function stopAll() {
  for (const p of children) {
    try {
      // 프로세스 묶음째로 끈다 (npm·gradle이 띄운 자식까지)
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      // 이미 꺼졌다.
    }
  }
}

// Ctrl+C(SIGINT)나 다른 프로그램이 끌 때(SIGTERM) 모두 자식까지 끈다.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('끕니다.');
    stopAll();
    process.exit(0);
  });
}

async function main() {
  let mode = 'running';
  if (await serverUp()) log('서버가 이미 떠 있어 그대로 씁니다.');
  else mode = startServer();
  if (!(await waitForServer(mode === 'docker' ? 600 : 240))) {
    log('서버가 뜨지 않았습니다. 위의 기록(또는 server/build/local-server.log)을 봐 주세요.');
    stopAll();
    process.exit(1);
  }
  log('서버가 떴습니다.');
  if (!args.has('--no-seed')) execSync(`node scripts/seed-local.mjs ${API}`, { cwd: ROOT, stdio: 'inherit' });
  startWeb();
  log('시험 계정: 별빛연출가 / night-sky-local-1, 불꽃장인 / night-sky-local-2 (로컬 전용)');
  if (mode === 'docker') log('Ctrl+C로 화면을 끄고, 컨테이너는 `npm run local:stop`으로 끕니다.');
  else log('Ctrl+C로 화면과 서버를 함께 끕니다.');
}

main();
