# dsh-context-console

DSH（DeepSeek Harness）的「上下文运维」插件：在会话视图环中提供一个与 Chat / Trajectory 平级的 **「上下文」Tab**，实时分析该会话的上下文构成（静态开销 vs 动态内容、工具目录覆盖、注入来源），并自动修剪超阈值的大工具结果，把上下文预算还给真实工作。

> 开发背景：源自 DSH 轨迹挖掘与上下文优化实验（实验完整记录为本地 Obsidian 文档：`学习资料/DSH轨迹挖掘与上下文优化实验_完整记录.md`）。动态插件刷新即失，本包固化为 DSH profile 正式插件，重启/刷新常驻。

## 功能

- **上下文构成仪表盘**（Client 视图 Tab「上下文」）
  - 静态开销（system prompt + 工具目录）vs 动态内容占比条
  - 估算 token 数、错误计数
  - 工具目录清单：schema 大小排序、已调用打勾
  - 注入来源构成（用户输入 / 插件快照 / 技能目录）
- **工具结果修剪器**（Host 侧，默认开启）
  - 拦截 `tools/post-execute`，超过阈值（默认 8192 字符）的工具结果裁剪为 head 4096 + marker + tail 1024（官方 `toolResultPruner` 规则）
  - 在写入会话日志前生效，降低后续请求的输入量（实测单个大输出可省 90%+，全会话约 44%）
- **修剪统计**（「上下文」Tab）
  - 从会话节点统计已裁剪的工具结果数（含 `[... tool result middle pruned ...]` 标记）
  - 「结果修剪器」卡片显示已裁剪 N 个 + 预算规则说明

## 结构

```
dsh-context-console/
├── package.json   # 插件声明（dsh.client + exports["./client"]）
└── lib/
    ├── index.js   # Host 半：工具结果修剪器（tools/post-execute 拦截）
    └── client.js  # Client 半：「上下文」视图（conversation.view slot 注册）
```

## 安装到 DSH

1. 将本仓库放到 profile 可访问位置（如 `~/.dsh/profiles/web/plugins/context-console/`）
2. 在 `~/.dsh/profiles/web/package.json` 的 dependencies 添加：
   ```json
   "@local/context-console": "file:./plugins/context-console"
   ```
3. 在 `~/.dsh/profiles/web/cordis.patch.yml` 添加：
   ```yaml
   - insert:
       - id: context-console
         name: '@local/context-console'
   ```
4. 在 profile 目录执行 `pnpm install`，重启 `dsh web`。

## 配置

`cordis.patch.yml` 插行可加 config 覆盖阈值：

```yaml
- id: context-console
  name: '@local/context-console'
  config:
    threshold: 8192   # 超过此字符数才修剪
    head: 4096        # 保留前 N 字符
    tail: 1024        # 保留尾 N 字符
    enabled: true     # 可设为 false 禁用修剪
```

## License

MIT