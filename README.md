# ajtc-chain-engine

> DeepSeek Harness（**dsh**）插件 · 把 **AJTC 自动化触发链系统**（引擎 + 链 + 记忆）直接装进 dsh，支持通过 **dsh 插件市场** 一键安装。
>
> **🎯 定位**：面向 Agent 的**执行层治理**插件——以 `iron-laws`（硬规则）/ `deletionGuard`（删除·不可逆操作护栏）/ `verificationGate`（声称完成前须有证据）保证「AI 诚实 + 不破坏持久状态」；与 `dsh-gov`（企业级权限 / 成本治理）**互补而非竞争**。

[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-ready-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/license-MIT-2EA44F)](LICENSE)

AJTC（Automated JSON Trigger-Chain）是一套事件队列 + 黑板 + 统一信封架构的触发链引擎：把复杂多步骤任务拆成「节点图」，每个节点受治理约束（铁律、验收门、预算护栏）。本插件把整套引擎 **vendored** 进一个 dsh 包，并注册三个工具让 dsh agent 直接调度它。

---

## ✨ 特性

- **开箱即用**：内置**离线 mock 模型**（确定性、可复现、零外部依赖），零配置即可验证链路结构。
- **记忆后端可配置**：记忆系统支持 TencentDB Agent-Memory MemoryCore（远程）或本地文件后端，由环境变量切换；后端不可达时优雅降级，不影响链运行。
- **默认铁律随包携带**：通用治理铁律 `iron-laws.json` 作为默认参考随插件分发，可经 `ajtc_recall_memory` 召回；用户可让 agent 自行建立专属铁律系统。
- **治理护栏内置**：链内已有删除护栏、验证门、预算上限等机械约束，非自由发挥。
- **安装即 marketplace 可见**：仓库打 `dsh-plugin` 话题标签后，可被 dsh 插件市场扫描并一键安装。

---

## 📦 安装

### 方式一：命令行（推荐，可回滚、可写进脚本）

```bash
# 安装到 web profile（桌面端一般用 desktop；写错 profile 会出现"装了却没反应"）
dsh plugin --profile web add github:<owner>/ajtc-chain-engine

# 查看已装
dsh plugin --profile web list

# 卸载
dsh plugin --profile web remove ajtc-chain-engine
```

> 安装会把本包写入该 profile 的 `package.json` 依赖，并登记进 `dsh.profile.bundles`，重启 dsh 后生效。

### 方式二：插件市场（图形界面）

1. 先装一个插件市场（如 [`@springbrand/dsh-plugin-marketplace`](https://dshpluginhub.ai/en/plugins/springbrand-dsh-plugin-marketplace) 或 `github:mengxingGG/dsh-plugin-marketplace`）。
2. 打开 **Settings → Plugin Marketplace**，搜索 `ajtc-chain-engine`，点击 **Install**。
3. 重启 dsh。

> 要让本仓库出现在市场目录里，只需在 GitHub 仓库设置页添加话题 **`dsh-plugin`** 即可（市场按该话题扫描公开仓库，并校验根 `package.json` 是否声明 `dsh.bundle.patch`）。

---

## ⚙️ 配置（可选）

| 环境变量 | 作用 | 默认 |
| --- | --- | --- |
| `MEMORY_BACKEND` | 记忆后端：`local`（本地文件）或 `tencentdb`（远程 MemoryCore） | `local` |
| `MEMCORE_BASE_URL` | TencentDB Agent-Memory MemoryCore 端点（`tencentdb` 模式生效；不可达时优雅降级） | `http://127.0.0.1:8420` |
| `MEMCORE_API_KEY` | MemoryCore 访问密钥（可选，视部署方要求） | 空 |
| `MEMORY_LOCAL_DIR` | 本地后端存储目录（`local` 模式生效） | `engine/.runtime/memory` |
| `AJTC_SHADOW_DIR` | 影子回放录制目录（安装到只读 node_modules 时务必指向可写目录） | 包内 `.runtime/shadow` |

完整示例见 [`engine/.env.example`](engine/.env.example)。

---

## 🛠 工具

插件向 dsh 注册三个工具：

| 工具 | 说明 |
| --- | --- |
| `ajtc_list_chains` | 列出全部已注册触发链（id / 标题 / 节点数） |
| `ajtc_run_chain` | 运行某条链：`{ chainId, goal?, mock=true, json=true }` |
| `ajtc_recall_memory` | 在策展记忆层按关键词召回约束与历史决策 |

示例对话（在 dsh 里）：

> 「用 `gen.chain-governance` 审一下当前改动」→ 自动调用 `ajtc_run_chain`
> 「查一下删除相关的铁律」→ 自动调用 `ajtc_recall_memory`

---

## 🧠 记忆打包策略

为保证体积与隐私可控，插件**默认只携带通用记忆层模板**（不携带任何用户项目记忆）：

```
memory/
├── README.md                 # 记忆层说明：默认铁律位置、如何自建铁律系统、资产登记仅模板
└── asset-registry.template.md # 资产登记**模板**（占位符，用户按需填写或仅保留模板）
```

> 默认铁律注册表位于 `engine/chains/governance/iron-laws.json`，作为通用治理参考随包分发；用户可让 agent 在其基础上建立自己的铁律系统（新增 / 修订铁律写回该文件或由用户指定位置）。
> `asset-registry` 仅作为模板存在：用户可选择「仅保存模板」或填入自己的资产登记。
> 每日开发日志等过程性记忆**不随插件分发**；如需本地沉淀，自行在 `memory/` 下维护。

---

## 🏗 架构

```
ajtc-chain-engine/                ← dsh 插件包（Cordis 包）
├── index.js                      ← Cordis 插件入口：apply(ctx) 注册工具 + 注入 system prompt
├── cordis.patch.yml             ← 插入 profile layer 栈
├── package.json                  ← 含 dsh.bundle.patch / dsh.manifestVersion
├── engine/                       ← vendored AJTC 运行时（CommonJS，独立子进程隔离）
│   ├── src/                      ← cli.js + engine/* + adapters/* + genesis/*
│   ├── chains/                   ← 通用触发链（genesis / governance / generic-pipeline / explainer / extract / summarize / identity / video-to-knowledge / demo 等）
│   ├── schemas/                  ← 链 JSON Schema
│   └── .env.example
├── memory/                       ← 通用记忆层模板（资产登记模板 + 说明）
└── scripts/                      ← 可选本地工具
```

**运行时隔离**：`index.js`（ESM）通过 `child_process.spawn` 调用 `engine/src/cli.js`（CommonJS），互不污染模块系统；影子回放录制经 `AJTC_SHADOW_DIR` 重定向到可写目录，避免写入只读的 `node_modules`。

---

## 🔧 本地开发 / 自托管发布

```bash
# 在 dsh profile 里从本地路径装（开发调试）
dsh plugin --profile web add file:$(pwd)

# 发布到 npm（让市场也能从 npm 安装）
npm publish          # 需先 npm login；files 字段已限定只发布必要文件

# 打 dsh-plugin 话题，让市场收录
# → GitHub 仓库 Settings → Topics → 添加 dsh-plugin
```

---

## 📄 许可

[MIT](LICENSE)。AJTC 引擎与本项目均为社区维护，与 DeepSeek 官方无隶属关系。
