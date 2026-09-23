# OpenCode Yee Profile

一个 OpenCode **V2** 插件：原生 Build 直接干活，Explore、Oracle、Designer 按需使用。

不替换 Build 提示词，不提供 Orchestrator、调度器、任务板、自动唤醒、CLI 或 bootstrap。
插件只注册一次 Agent transform；不改配置文件、会话消息或工具目录，不自动调用模型。

## 使用

要求 Node.js 24+、pnpm 10，以及支持 `@opencode/plugin` 2.0.12 API 的 OpenCode V2。
这是单包项目，借鉴 `opencode-providers` 的 TypeScript / pnpm / tsdown / Vitest / Biome 工程栈。

```sh
pnpm install
pnpm build
```

在 OpenCode 的 `opencode.jsonc` 中注册本地仓库的**绝对路径**：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/Users/yee.wang/Code/github/opencode-yee-profile"
  ]
}
```

其他机器替换成本地路径。当前无需发布 npm；不要把尚未发布的包名当成可安装版本。
保留自己的 providers、MCP 和其他无关配置。重新加载 OpenCode 后，在新会话使用 Build；
已存在会话的 Agent/模型选择不会被插件强制切换。

### 指定模型或关闭专家

下面的 `your-provider/your-model` 是占位符，请替换为你已经配置的实际模型 ID：

```jsonc
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-yee-profile",
      "options": {
        "agents": {
          "explore": { "model": "your-provider/your-fast-model" },
          "oracle": false,
          "designer": { "model": "your-provider/your-design-model#high" }
        }
      }
    }
  ]
}
```

三个专家默认启用。配置值只接受 `false` 或 `{ "model"?: "provider/model#variant" }`。
省略模型时保留该 Agent 已有的模型配置；没有已有配置则由宿主继承父会话模型。
不存在自动选模型、fallback 链、prompt append 或预设继承。
未知键会报错，防止写错配置却静默生效。主模型仍然由 OpenCode 本身管理。

## 运行边界

| 入口 | 职责 | 本插件的行为 |
| --- | --- | --- |
| Build | 理解、实现、验证 | 仅选为默认入口，Agent 内容完全不修改 |
| Explore (`explore`) | 找到代码位置与相关调用路径 | 复用原生 ID，短提示词，只读 |
| Oracle (`oracle`) | 独立判断、权衡、难题分析 | 短提示词，只读 |
| Designer (`designer`) | 设计并实现 UI/UX | 短提示词，保留宿主/已有工具权限，禁止继续委派 |

Explore / Oracle 采用工具白名单：仅 `read`、`glob`、`grep`；外部目录和敏感 `.env` 文件读取需批准。
它们不能运行 shell、编辑文件、调用任意 MCP 或派生子 Agent；复杂外部研究由 Build 直接使用自己的工具完成。
插件拥有这三个角色的提示词与权限策略；如已配置同名角色，加载后会应用上述策略。
其他原生及自定义 Agent 不删除，已有额外角色需要你自行关闭。

**按需不等于强制手动。** 插件没有路由提示或委派流程；Build 根据任务和专家 description 决定是否调用。
用户也可明确要求使用某个专家。前台、后台和会话续接全部交给 OpenCode 原生 `subagent`。

### 从 oh-my-opencode-slim 迁移

1. 在原来的配置来源中移除/禁用 slim 插件，保留模型供应商、MCP 等无关配置。
2. 注册本插件；先不添加任何 Build system 覆盖。
3. 检查全局/项目 `AGENTS.md`、自定义 Agent 和 skills，清理仍强制引用旧调度流程的规则。
4. 重新加载并新建 Build 会话。

不能只删除 `orchestrator.md`：slim 会退回其内置提示词。也不能靠本插件删除另一个插件的 hooks。
不要把两个插件叠加后当作完成迁移。卸载本插件只需删除其 `plugins` 条目并重新加载，没有附带文件需要清理。

## 提示词原则

Build 新增 system 字数为 **0**。专家正文每个不超过 **50 个英文词**，路由 description 不超过 **25 个词**；测试固定这两个预算。

每段只说明会改变行为的信息：目标、证据、停止条件或交付标准。权限交给代码，不在提示词里重复工具禁令；
没有“你是顶级专家”、模型能力倍率、固定多阶段流程或每轮状态播报。提示词唯一来源是 `src/agents.ts`。

参考了 `writing-for-agents` 的 single source of truth、pruning、completion criteria，以及
[公开 Cursor 提示词样本](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/tree/main/Cursor%20Prompts) 中的直接执行思路。
这些 Cursor 样本非官方且主要标注为 2025 年；本项目没有复制其完整提示词，也不声称代表当前 Cursor。

## 开发与验证

```sh
pnpm check                     # lint、构建、类型、测试、构建产物 smoke
pnpm smoke:host -- opencode2    # 可选：真实 V2 私有宿主，不发模型请求
pnpm pack                      # 生成可分发 tarball，不发布
```

`smoke:host` 使用临时 HOME/XDG 目录和私有服务，不读取或修改你的全局 OpenCode 配置。
它等待宿主注册表就绪，对比加载插件前后的原生 Build，并验证模型/关闭选项生效。
该脚本需要本机已有 V2 可执行文件；CI 不下载宿主。
单元测试验证权限边界、重复注册、选项校验、提示词预算及零运行时 hook。
这些检查证明配置与加载契约，不代表不同模型的任务质量或延迟已经做过基准测试。

```text
src/index.ts       插件入口：一次 transform
index.js           本地目录入口，仅转导出构建产物
src/register.ts    专家注册与默认 Build
src/agents.ts      专家短提示词及只读权限
src/options.ts     最小配置校验
tests/             单元与契约测试
scripts/           产物及真实宿主 smoke
```

宿主 API 参考：[V2 Agents](https://opencode.ai/v2/docs/agents) · [V2 Plugins](https://opencode.ai/v2/docs/build/plugins)。
