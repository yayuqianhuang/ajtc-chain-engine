// smoke.mjs — ajtc-chain-engine CI smoke test (mock-only, zero external deps)
//
// 设计目标（对齐 Engineering Assurance Team Go/No-Go 报告 Tessa 的放行条件）：
//   1. 断言 16 条链正常注册（cli list）
//   2. 断言引擎只含 mock 适配器（无真实 LLM 切换分支，离线可跑）
//   3. 断言 demo.aegis-guard --mock 能在零外部依赖下完整跑通（exit 0）
// 全程不触碰 mysql2 / 真实 LLM / 网络；CI 与本地同一份逻辑。

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CLI = join(ROOT, 'engine', 'src', 'cli.js');

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name} ${extra}`);
    failures++;
  }
}

console.log('ajtc-chain-engine smoke (mock-only)\n');

// 0. 前置：CLI 存在
check('engine/src/cli.js exists', existsSync(CLI));

// 1. cli list → 16 chains
const listRes = spawnSync(process.execPath, [CLI, 'list'], {
  cwd: ROOT,
  encoding: 'utf8',
});
check('cli list exits 0', listRes.status === 0, JSON.stringify(listRes.error || ''));
const chainCount = (listRes.stdout.match(/已注册的链（(\d+)）/) || [,'0'])[1];
check('16 chains registered', chainCount === '16', `(got ${chainCount})`);

// 2. 仅 mock 适配器（无真实 LLM 切换分支）
const adaptersDir = join(ROOT, 'engine', 'src', 'adapters');
const adapters = existsSync(adaptersDir)
  ? readdirSync(adaptersDir).filter((f) => f.endsWith('.js'))
  : [];
check(
  'only mock adapter present (offline-safe)',
  adapters.length === 1 && adapters[0] === 'mock.js',
  `(${adapters.join(',') || 'none'})`
);

// 3. demo.aegis-guard --mock 完整跑通
const runRes = spawnSync(
  process.execPath,
  [CLI, 'run', 'demo.aegis-guard', '--mock'],
  { cwd: ROOT, encoding: 'utf8' }
);
check(
  'demo.aegis-guard --mock exits 0',
  runRes.status === 0,
  (runRes.stderr || '').slice(0, 200)
);

console.log(
  failures === 0
    ? '\nSMOKE PASS ✅'
    : `\nSMOKE FAIL ❌ (${failures} check(s) failed)`
);
process.exit(failures === 0 ? 0 : 1);
