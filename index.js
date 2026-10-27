/**
 * @ajtc-chain-engine host entry (DeepSeek Harness / dsh Cordis plugin)
 *
 * 把 AJTC 自动化触发链系统接入 dsh：
 *   - 注册三个工具：ajtc_run_chain / ajtc_list_chains / ajtc_recall_memory
 *   - 向 system prompt 注入一段能力说明，让 dsh agent 知道何时调用 AJTC
 *   - 引擎以「独立子进程」跑 vendored 的 engine/src/cli.js，与 dsh 的 ESM 进程隔离，
 *     避免 ajtc（CommonJS + 内部依赖）污染 dsh 运行时。
 *
 * 引擎默认走离线 mock 适配器，零配置即可验证链路；本插件仅内置 mock（无真实 LLM 接入）。
 * 记忆后端（TencentDB Agent-Memory / 本地文件）可经环境变量切换，详见 README 与 engine/.env.example。
 */

import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'ajtc-chain-engine'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, 'engine', 'src', 'cli.js')
const ENGINE_DIR = join(HERE, 'engine')
const MEMORY_DIR = join(HERE, 'memory')
const SHADOW_DIR = join(HERE, '.runtime', 'shadow')

// 安装到只读 node_modules 时，影子回放录制必须落到可写目录
try { mkdirSync(SHADOW_DIR, { recursive: true }) } catch { /* 包内运行时可写即可 */ }

/** 子进程跑 ajtc CLI，返回 { code, stdout, stderr } */
function runCli(args, extraEnv = {}, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, AJTC_SHADOW_DIR: SHADOW_DIR, ...extraEnv }
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: ENGINE_DIR,
      env,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`ajtc cli timeout after ${timeoutMs}ms`))
    }, timeoutMs)
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

/** 递归扫描 chains 目录，提取 { id, title, nodes } */
function listChains() {
  const out = []
  const walk = (dir) => {
    let entries = []
    try { entries = readdirSync(dir) } catch { return }
    for (const e of entries) {
      const p = join(dir, e)
      let s
      try { s = statSync(p) } catch { continue }
      if (s.isDirectory()) walk(p)
      else if (e.endsWith('.json')) {
        try {
          const j = JSON.parse(readFileSync(p, 'utf8'))
          if (j && typeof j.id === 'string' && j.title) {
            out.push({ id: j.id, title: j.title, nodes: Array.isArray(j.nodes) ? j.nodes.length : 0 })
          }
        } catch { /* 非链 JSON，跳过 */ }
      }
    }
  }
  walk(join(ENGINE_DIR, 'chains'))
  return out
}

/** 在策展记忆层里按关键词召回片段 */
function recallMemory(query, max = 6) {
  const terms = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (terms.length === 0) return '(空查询)'
  const hits = []
  const walk = (dir) => {
    let entries = []
    try { entries = readdirSync(dir) } catch { return }
    for (const e of entries) {
      const p = join(dir, e)
      let s
      try { s = statSync(p) } catch { continue }
      if (s.isDirectory()) walk(p)
      else if (/\.(md|json)$/.test(e)) {
        let text = ''
        try { text = readFileSync(p, 'utf8') } catch { continue }
        const low = text.toLowerCase()
        const score = terms.reduce((a, t) => a + (low.includes(t) ? 1 : 0), 0)
        if (score > 0) {
          const lines = text.split('\n')
          const ctx = lines
            .filter((l) => terms.some((t) => l.toLowerCase().includes(t)))
            .slice(0, 3)
            .join('\n')
          hits.push({ rel: p.replace(HERE, '.'), score, ctx })
        }
      }
    }
  }
  walk(MEMORY_DIR)
  // 默认铁律注册表（engine/chains/governance/iron-laws.json）也是可召回的策展记忆
  const ironLaws = join(ENGINE_DIR, 'chains', 'governance', 'iron-laws.json')
  try {
    const text = readFileSync(ironLaws, 'utf8')
    const low = text.toLowerCase()
    const score = terms.reduce((a, t) => a + (low.includes(t) ? 1 : 0), 0)
    if (score > 0) {
      const lines = text.split('\n')
      const ctx = lines.filter((l) => terms.some((t) => l.toLowerCase().includes(t))).slice(0, 3).join('\n')
      hits.push({ rel: ironLaws.replace(HERE, '.'), score, ctx })
    }
  } catch { /* 无铁律文件则跳过 */ }
  hits.sort((a, b) => b.score - a.score)
  if (hits.length === 0) return '(记忆层未匹配到相关条目)'
  return hits
    .slice(0, max)
    .map((h) => `[${h.rel}]\n${h.ctx}`)
    .join('\n\n')
}

function textResult(text) {
  return { content: [{ type: 'text', text: String(text) }] }
}

export function apply(ctx) {
  // —— 工具 1：运行一条触发链 ——
  ctx.tools.register({
    name: 'ajtc_run_chain',
    description:
      '运行 AJTC 自动化触发链系统中的一条链。传入 chainId 与可选 goal；默认走离线 mock 模型（无需 API Key）。' +
      '适合把复杂多步骤任务（代码治理、项目盘点、记忆蒸馏、退款编排等）交给受治理约束的链执行。',
    inputSchema: {
      type: 'object',
      properties: {
        chainId: { type: 'string', description: '链 id，如 sys.genesis / gen.chain-governance / gen.generic-pipeline / gen.explainer' },
        goal: { type: 'string', description: '本次运行的业务目标 / 输入（自然语言）' },
        mock: { type: 'boolean', default: true, description: '固定为离线 mock（本插件仅内置 mock 适配器）；保留字段以兼容调用方' },
        json: { type: 'boolean', default: true, description: 'true=输出结构化 JSON 结果' },
      },
      required: ['chainId'],
    },
    async execute({ chainId, goal = '', mock = true, json = true }) {
      // 本插件仅内置离线 mock 适配器；mock 参数保留以兼容调用方，实际恒为 mock。
      const args = ['run', String(chainId), '--mock', json ? '--json' : '', '--quiet']
        .filter(Boolean)
      if (goal) args.push('--goal', goal)
      const { code, stdout, stderr } = await runCli(args, {})
      if (code !== 0 && !stdout) {
        return textResult(`链运行失败 (exit ${code}):\n${stderr || '(无 stderr)'}`)
      }
      return textResult(stdout || stderr)
    },
  })

  // —— 工具 2：列出已装载的链 ——
  ctx.tools.register({
    name: 'ajtc_list_chains',
    description: '列出 AJTC 引擎中已注册的全部触发链（id / 标题 / 节点数），帮助选择要运行的链。',
    inputSchema: { type: 'object', properties: {}, required: [] },
    async execute() {
      const chains = listChains()
      if (chains.length === 0) return textResult('(未找到任何链)')
      const body = chains
        .map((c) => `- ${c.id}  ·  ${c.title}  (${c.nodes} 节点)`)
        .join('\n')
      return textResult(`已注册 ${chains.length} 条触发链：\n${body}`)
    },
  })

  // —— 工具 3：召回策展记忆 ——
  ctx.tools.register({
    name: 'ajtc_recall_memory',
    description:
      '在 AJTC 的策展记忆层（默认铁律 iron-laws、资产登记模板、治理台账模板）中按关键词召回相关片段。' +
      '用于在不打扰用户的前提下查询项目约束、历史决策与治理红线。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词（空格分隔，命中越多排序越前）' },
        max: { type: 'number', default: 6, description: '最多返回几个命中片段' },
      },
      required: ['query'],
    },
    async execute({ query, max = 6 }) {
      return textResult(recallMemory(query, Number(max) || 6))
    },
  })

  // —— 注入 system prompt 能力段 ——
  if (ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
    ctx.systemPrompt.section(() => ({
      role: 'system',
      content:
        '[AJTC 触发链系统已挂载]\n' +
        '你可以通过下列工具调用 AJTC 自动化触发链：\n' +
        '• ajtc_list_chains —— 列出可用链\n' +
        '• ajtc_run_chain —— 运行某条链（固定离线 mock，零配置）\n' +
        '• ajtc_recall_memory —— 在策展记忆层（默认铁律/资产登记模板/治理台账模板）召回约束与历史决策\n' +
        '适用场景：代码治理、项目现状盘点、记忆蒸馏、退款编排、跨项目规约查询等需要「受治理的多步骤自动化」的任务。' +
        '复杂任务优先交给链执行，而非逐步手写。',
    }))
  }
}
