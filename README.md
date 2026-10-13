# OpenCode Yee Profile

OpenCode V1/V2 插件：保留原生 Build，提供 General、Explore、Oracle、Designer。

从 `0.2.0` 起支持 V1/V2；`0.1.x` 仅支持 V2。

## 使用

需要 Node.js 24+，以及 OpenCode V1 **1.18.29+** 或支持 `@opencode/plugin` 2.0.12 API 的 V2。

V2，在 `opencode.jsonc` 中加入：

```jsonc
{
  "plugins": ["@yee94/opencode-profile@0.2.2"]
}
```

V1 使用同一个包，配置键是单数 `plugin`：

```jsonc
{
  "plugin": ["@yee94/opencode-profile@0.2.2"]
}
```

重新加载 OpenCode，新建 Build 会话。从 slim 迁移时，先移除旧插件条目。
可直接要求「让 general 实现这个任务」「让 oracle 审查这次设计」。自动委派遵循宿主及项目指令。

| Agent | 用途 |
| --- | --- |
| Build | 主执行者，提示词、模型和权限保持原样 |
| General (`general`) | 执行明确的编码任务，完成实现、验证并回报结果 |
| Explore | 只读代码定位 |
| Oracle | 只读架构审查：OCP、奥卡姆剃刀、YAGNI；合理即放行 |
| Designer | UI/UX 设计与实现 |

插件默认将 General / Designer 设为禁止递归委派，将 Explore / Oracle 设为仅允许 read、glob、grep。Explore 被续接并要求修复时也应只回报发现，由 Build / General 实现。

### V2 权限优先级

V2 的配置规则会追加在插件 transform 之后，最后匹配的规则生效。全局 `permissions: [{ "action": "*", "resource": "*", "effect": "allow" }]`（包括兼容的 V1 `permission: { "*": "allow" }`）会重新开放 Explore / Oracle 的编辑、shell 和委派权限，也会覆盖 General / Designer 的禁止递归委派规则。提示词不能代替权限约束。

使用全局宽松权限时，把 [examples/permissions.v2.json](examples/permissions.v2.json) 的 `agents.<id>.permissions` 合并进你的 `opencode.jsonc`，保留已有模型等字段。这些原生 Agent 规则在全局规则之后生效。后续项目级 Agent 配置、插件或会话级权限仍可覆盖它们；排查时应检查最终权限，而非只看插件输出。

插件不会自动写入配置文件。`pnpm smoke:host` 在隔离宿主中验证全局 `* allow` 与上述配置一起使用时的最终权限，并验证原生 Build 保持不变。

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
    "package": "@yee94/opencode-profile@0.2.2",
    "options": { "agents": { "oracle": false } }
  }]
}
```

V1 的插件选项使用元组：

```jsonc
{
  "plugin": [[
    "@yee94/opencode-profile@0.2.2",
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
专家正文在 `src/prompts/*.md`，由 `src/agents.ts` 导入、tsdown 内联到产物；运行时不读取 Markdown 文件。
`pnpm smoke:host` 验证 V2；`pnpm smoke:host:v1 -- /path/to/opencode-v1` 验证 V1。均在隔离环境运行，不发模型请求。
