# PUBLISH.md — 把 ajtc-chain-engine 发布为 dsh 插件

本文件是给**你（仓库 owner）**的发布 runbook。插件本体已做完代码卫生与 CI 冒烟，
剩下的步骤都需要在**你的机器/你的账号**上执行（涉及 GitHub 鉴权、`dsh` 安装、真实联网验证），
助手无法代执行。

---

## 关键事实（先读，避免误操作）

- 当前 `dsh-plugins/ajtc-chain-engine/` 只是父仓库 `AIJsonPromptChaining` 的**未跟踪子目录**，
  不是独立 git 仓库。**发布 = 把子目录抽取成独立仓库**，不是 `git push`。
- GitHub owner = `yayuqianhuang`（已写入 `package.json` 的 `repository.url`）。
- 安装路径：`dsh plugin --profile web add github:yayuqianhuang/ajtc-chain-engine`
- 市场发现机制：仓库打 **`dsh-plugin`** 话题标签即被收录（已与 SRE 跨 dsh-plugin.org /
  ai-develop.top / deepseekharness.io 核实）。**npm publish 不是必需步骤**，
  `dsh.plugin.add github:` 直接从 GitHub 仓库拉取；`package.json` 里的 `files`/`publishConfig`
  仅作为 npm registry 兜底。
- 已验证：ESM(root, `type:module`) 与 CJS(engine) 通过 `spawn` 隔离，零模块互操作风险；
  `engines.node >=22.19` 已锁定。

---

## 阶段清单（✅ = 已替你完成，⏳ = 你来执行）

| 阶段 | 内容 | 状态 |
|------|------|------|
| 1① | `package.json` 占位符 `<owner>` → `yayuqianhuang` | ✅ 已完成 |
| 1② | `_fixture_aegis_del-blocked.json` 机器路径脱敏（去 `24485` 用户名 + 机器布局） | ✅ 已完成 |
| 1③ | `deliverables/` 不进发布（`files` 数组已排除 + 抽取时 `rm -rf`） | ✅ 已完成 |
| 7 | `scripts/smoke.mjs` + `.github/workflows/smoke.yml` + `npm test` 脚本 | ✅ 已完成（本地 5/5 通过）|
| 0 | 前置：GitHub CLI 登录、本机装好 dsh 且 `web` profile 就绪 | ⏳ 你 |
| 2 | 抽取子目录 → 独立仓库目录 | ⏳ 你（命令见下）|
| 3 | `gh repo create` + 推送 | ⏳ 你 |
| 4 | `gh repo edit --add-topic dsh-plugin` | ⏳ 你 |
| 5 | 干净机器 `dsh plugin --profile web add github:...` 真实验证 | ⏳ 你 |
| 6 | 回滚 / 二次确认 | ⏳ 你 |

---

## Phase 0 — 前置（你执行）

```bash
# 1) GitHub CLI 登录（SSH 或 HTTPS 二选一，本仓库 origin 是 SSH）
gh auth login

# 2) 确认 dsh 已装、web profile 存在
dsh --version
dsh plugin --profile web list        # 应能看到已装插件列表（或空）
```

---

## Phase 2 — 抽取子目录为独立仓库（你执行，Git Bash）

```bash
SRC="/d/Program Files (x86)/AIWorkBuddy/AIJsonPromptChaining/dsh-plugins/ajtc-chain-engine"
DST="$HOME/ajtc-chain-engine-standalone"     # ✅ 用 $HOME；Git Bash 里 $USER 常为【空】，勿写 /c/Users/$USER

rm -rf "$DST"
mkdir -p "$DST"
# 复制插件本体（保留结构）
cp -R "$SRC/." "$DST/"

# 关键：剔除交付物 / 内部审计文档（不进公开仓库）
rm -rf "$DST/deliverables"

cd "$DST"
git init -b main
git add -A
git status            # 人工确认：没有 24485 / Program Files / AIWorkBuddy 残留路径
git commit -m "chore: ajtc-chain-engine v0.1.0 dsh plugin (genericized, mock-only)"
```

---

## Phase 3 — 建仓库 + 推送（你执行）

```bash
cd "$DST"
# 公开仓库（市场才能发现）；--source 指向当前目录
gh repo create ajtc-chain-engine --public --source=. --remote=origin --push
# 若已手动建好空仓库，则：
#   git remote add origin git@github.com:yayuqianhuang/ajtc-chain-engine.git
#   git push -u origin main
```

---

## Phase 4 — 打话题标签（你执行，市场发现的关键）

```bash
gh repo edit yayuqianhuang/ajtc-chain-engine --add-topic dsh-plugin
gh repo edit yayuqianhuang/ajtc-chain-engine --add-topic deepseek-harness
gh repo edit yayuqianhuang/ajtc-chain-engine --add-topic trigger-chain
gh repo edit yayuqianhuang/ajtc-chain-engine --add-topic agent
# 治理赛道定位（提升 governance 方向检索命中，与 dsh-gov 互补）
gh repo edit yayuqianhuang/ajtc-chain-engine --add-topic agent-government
gh repo edit yayuqianhuang/ajtc-chain-engine --add-topic ai-governance
```

> 只有 **`dsh-plugin`** 是市场强制识别标签（缺它市场不扫描）；`agent-government` / `ai-governance` 等用于治理赛道检索，与 `dsh-gov`（企业级权限/成本治理）互补而非竞争。

---

## Phase 5 — 干净机器真实验证（你执行）

在一台**没 clone 过本插件**的机器（或当前机器另起干净目录 / 临时 profile）运行：

```bash
dsh plugin --profile web add github:yayuqianhuang/ajtc-chain-engine
# 预期：插件被拉取并注册到 web profile
dsh plugin --profile web list | grep ajtc-chain-engine

# 验证工具可用（具体命令以 dsh 该版本 help 为准）
dsh plugin --profile web run ajtc-chain-engine -- list
dsh plugin --profile web run ajtc-chain-engine -- run demo.aegis-guard --mock
```

> 若 `dsh plugin add github:` 需要仓库**先被市场索引**，打标签后等几分钟再试。
> 若报 `engines.dsh` 不满足，核对本机 dsh 版本是否在 `>=0.1.0-rc.7 <0.3.0`。

---

## Phase 6 — 回滚 / 二次确认

```bash
# 安装不满意的回滚
dsh plugin --profile web remove ajtc-chain-engine

# 仓库侧如需改名 / 删库
gh repo delete yayuqianhuang/ajtc-chain-engine --yes   # 谨慎！
```

---

## 可选：npm 发布（兜底，非必需）

仅当你想让 `npm install ajtc-chain-engine` 也能用时才做：

```bash
cd "$DST"
npm publish --access public        # 需要 npm login + 包名未被占
```

插件核心能力靠 `dsh plugin add github:` 提供，npm 发布不影响市场收录。

---

## 发布前最终自检（建议逐项打勾）

- [x] `package.json` 无 `<owner>` 占位符
- [x] fixture 无 `24485` / 机器布局硬编码
- [x] `deliverables/` 已排除
- [x] `npm test` 本地 5/5 通过
- [ ] `git status` 人工确认无敏感路径（secret-scan 人工 sign-off）
- [ ] 干净机器 `dsh plugin --profile web add` 验证通过
- [ ] 仓库已打 `dsh-plugin` 话题
- [ ] CI（smoke.yml）在 GitHub Actions 跑绿
