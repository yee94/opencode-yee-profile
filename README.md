# OpenCode Yee Profile

OpenCode V2 插件：保留原生 Build，按需使用 Explore、Oracle、Designer。无调度器、自动唤醒或模型降级链。

## 使用

需要 Node.js 24+、支持 `@opencode/plugin` 2.0.12 API 的 OpenCode V2。

在 `opencode.jsonc` 中加入：

```jsonc
{
  "plugins": ["@yee94/opencode-profile@0.1.1"]
}
```

重新加载 OpenCode，新建 Build 会话。从 slim 迁移时，先移除旧插件条目。

| Agent | 用途 |
| --- | --- |
| Build | 主执行者，提示词、模型和权限保持原样 |
| Explore | 只读代码定位 |
| Oracle | 只读架构审查：OCP、奥卡姆剃刀、YAGNI；合理即放行 |
| Designer | UI/UX 设计与实现 |

## 配置模型

直接使用 OpenCode 原生配置。下面的模型 ID 为占位符，请替换为实际值：

```jsonc
{
  "model": "your-provider/main-model",
  "agents": {
    "explore": { "model": "your-provider/fast-model" },
    "oracle": { "model": "your-provider/review-model" },
    "designer": { "model": "your-provider/design-model" }
  }
}
```

不指定子 Agent 模型时继承父会话模型；已配置的 Agent 模型会保留。当前会话的主模型在 `/models` 中选择。
子 Agent 模型可追加 `#variant`，例如 `your-provider/review-model#high`，需模型本身支持。

关闭某个专家时，使用插件选项：

```jsonc
{
  "plugins": [{
    "package": "@yee94/opencode-profile@0.1.1",
    "options": { "agents": { "oracle": false } }
  }]
}
```

## 本地开发

```sh
pnpm install
pnpm build
pnpm check
```

将 `plugins` 中的包名替换为本仓库的绝对目录路径。修改后重新构建并重新加载插件。
专家正文在 `src/prompts/*.md`，由 `src/agents.ts` 导入、tsdown 内联到产物；运行时不读取 Markdown 文件。
`pnpm smoke:host -- opencode2` 可在隔离环境验证真实宿主加载，不发模型请求。
