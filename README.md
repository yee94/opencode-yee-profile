# OpenCode Yee Profile

OpenCode V1/V2 插件：保留原生 Build，提供 General、Explore、Oracle、Designer。

从 `0.2.0` 起支持 V1/V2；`0.1.x` 仅支持 V2。

## 使用

需要 Node.js 24+，以及 OpenCode V1 **1.18.29+** 或 V2 **2.0.27+**。

V2，在 `opencode.jsonc` 中加入：

```jsonc
{
  "plugins": ["@yee94/opencode-profile@0.3.0"]
}
```

V1 使用同一个包，配置键是单数 `plugin`：

```jsonc
{
  "plugin": ["@yee94/opencode-profile@0.3.0"]
}
```

重新加载 OpenCode，新建 Build 会话。从 slim 迁移时，先移除旧插件条目。
可直接要求「让 general 实现这个任务」「让 oracle 审查这次设计」。V2 为 Build 追加固定的探索委派指引；V1 的自动委派遵循宿主及项目指令。

| Agent | 用途 |
| --- | --- |
| Build | 原生主执行者，保留注册定义；V2 请求追加简短探索指引 |
| General (`general`) | 执行明确的编码任务，完成实现、验证并回报结果 |
| Explore | 只读代码定位 |
| Oracle | 只读架构审查：OCP、奥卡姆剃刀、YAGNI；合理即放行 |
| Designer | UI/UX 设计与实现 |

General / Designer 禁止递归委派；Explore / Oracle 仅使用 read、glob、grep。Explore 被续接并要求修复时也应只回报发现，由 Build / General 实现。

### V2 内部权限与探索委派

插件在专家子会话接收提示、发起模型请求前，等待内部权限规则写入完成。Explore / Oracle 的规则只保留最终有效的读取、搜索及外部目录权限，其他操作默认拒绝；General / Designer 只追加禁止委派。规则应用于首次调用和续接，也约束 Code Mode、shell 及未知 MCP 工具。写入失败时停止该次请求。

这解决了 V2 在插件 transform 后追加全局 `* allow` 导致的权限覆盖，无需添加原生 Agent 权限配置。排查时查看子会话的 `permissions`，静态 Agent 列表不是执行时权限的全貌。插件只处理启用的四个专家子会话。

Explore 是按需选择，不是所有任务的前置步骤。只有对陌生代码存在较大不确定性、独立探查的收益超过委派成本时，Build 才考虑调用；跨文件本身不构成必须委派的理由。几次定向查找、已知文件、明确修复、小改动和常规检查直接处理。明确要求不委派时遵循用户要求。Explore 不可用、被禁用或禁止调用时不追加指引。该指引是给模型的路由策略，不是强制调度器；模型是否选择委派仍需实际任务评估。

Build 的注册提示词、模型、权限和工具保持原样；插件只向 Build 模型请求追加一段固定文本。插件不改写配置文件或会话消息，不引入 Orchestrator、任务看板或后台调度。V1 保留启动配置回调，其专家权限由 V1 原生合并机制执行。

## 配置模型

直接使用 OpenCode 原生配置。下面是 V2，模型 ID 为占位符：

```jsonc
{
  "model": "your-provider/main-model",
  "agents": {
    "general": { "model": "your-provider/coding-model" },
    "explore": { "model": "your-provider/fast-model" },
    "oracle": { "model": "your-provider/review-model" },
    "designer": { "model": "your-provider/design-model" }
  }
}
```

V1 将 `agents` 改为 `agent`。V2 的 variant 写在模型后，如 `provider/model#high`；V1 原生配置写为 `{ "model": "provider/model", "variant": "high" }`。
省略模型时保留 Agent 已有配置，否则由宿主继承父会话模型。主模型在 `/models` 中选择。

关闭某个专家时，使用插件选项：

V2 若已配置该专家的原生 `agents.<id>` 条目，请同时移除该条目，或设置 `agents.<id>.disabled: true`，否则后加载的配置会重新创建它。

```jsonc
{
  "plugins": [{
    "package": "@yee94/opencode-profile@0.3.0",
    "options": { "agents": { "oracle": false } }
  }]
}
```

V1 的插件选项使用元组：

```jsonc
{
  "plugin": [[
    "@yee94/opencode-profile@0.3.0",
    { "agents": { "oracle": false } }
  ]]
}
```

两版插件选项一致：四个专家都支持 `false` 或 `{ "model": "provider/model#variant" }`；选项中的模型优先于原生 Agent 配置。

## 本地开发

```sh
pnpm install
pnpm build
pnpm check
```

将 `plugins`（V2）或 `plugin`（V1）中的包名替换为本仓库的绝对目录路径。修改后重新构建并重新加载插件。
提示词在 `src/prompts/*.md`，由 `src/agents.ts` / `src/runtime.ts` 导入、tsdown 内联到产物；运行时不读取 Markdown 文件。
`pnpm smoke:host` 在隔离 V2 宿主中使用本地模型桩，验证原生子会话调用、只读工具、续接后的写入拦截和 Build 请求指引；模型桩用于验证执行链路，不代表真实模型的委派成功率。`pnpm smoke:host:v1 -- /path/to/opencode-v1` 验证 V1 注册兼容性。两者都不调用外部模型，也不使用个人配置或凭据。
