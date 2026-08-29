# SeekTTY 1.2.5 — pnpm 11 installation compatibility

> Release candidate for Owner review. This document does not authorize or perform a tag, GitHub Release, npm publication, or repository visibility change.

## English

SeekTTY 1.2.5 makes installation and Profile plugin management predictable with pnpm 11 while preserving official DeepSeek Harness ownership of runtime and persistence state.

### pnpm 11 Global Virtual Store compatibility

- Launcher provisioning, compatible SeekTTY/dsh updates, and TUI plugin mutations now pass `--config.enable-global-virtual-store=false` to the individual package-tree command they own.
- SeekTTY does not change global pnpm configuration, set `NODE_PATH`, copy Host packages, install a second Host graph, or bypass native `dsh plugin` reconciliation.
- The adapter is restricted to the declared dsh range `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2`; the release candidate is tested against the unmodified official `@deepseek-ai/dsh@0.1.1-rc.2` and pnpm `11.7.0`.

### Actionable failure diagnosis

- When an affected package is actually resolved below `store/v11/links` and the current dsh/Cordis loader emits its known load failure, SeekTTY reports that precise condition instead of calling it a normal missing dependency.
- Recovery output is bilingual, uses the same per-command compatibility option, and redacts credentials from commands displayed to the user.
- Unsupported, unrelated, and future loader failures are not reclassified as this known issue.

### Release gates

- One candidate tarball is shared by the Windows, macOS, and Linux CI matrix on Node 22 and 24.
- With GVS disabled, the gate installs official dsh and SeekTTY in an isolated environment, then performs add, boot, remove, re-add, second boot, launcher isolation, and Host module-identity checks.
- With GVS enabled, the gate verifies the real `store/v11/links` layout. It accepts a complete lifecycle if upstream becomes compatible; otherwise it requires both the exact current loader signature and SeekTTY's recovery diagnosis.
- Unit tests cover command construction, supported-range boundaries, classification, credential redaction, and package/document contracts.

### Compatibility and upgrade

- Tested Host: unmodified official `@deepseek-ai/dsh@0.1.1-rc.2`.
- Node.js: `^22.19.0 || >=24`.
- No Settings, Profile, Session, theme, or plugin-manifest migration is introduced.
- Existing mouse, input, theme, welcome-page, and syntax-highlighting behavior is unchanged by this compatibility release.
- Clarify and Auxiliary Runtime remain optional; this release does not extend their historical joint-acceptance range.

### Owner publication boundary

The package remains `private: true`. This pull request prepares versioned source, generated bundles, bilingual documentation, and verification evidence only. The Owner must review the exact artifact and CI matrix before separately deciding whether to create `v1.2.5` and a GitHub Release. There is no npm Registry publication step in this candidate.

## 中文

SeekTTY 1.2.5 让 pnpm 11 下的安装与 Profile 插件管理更加可预测，同时继续由官方 DeepSeek Harness 持有运行时和持久化状态。

### pnpm 11 Global Virtual Store 兼容

- 启动器首次协调、兼容范围内的 SeekTTY/dsh 更新，以及 TUI 插件变更，都会给自己发起的单次包树命令附加 `--config.enable-global-virtual-store=false`。
- SeekTTY 不会修改全局 pnpm 配置、设置 `NODE_PATH`、复制 Host 包、安装第二套 Host 依赖图，也不会绕过原生 `dsh plugin` 协调。
- 适配器严格限制在声明的 dsh 范围 `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2`；本候选版本针对未修改的官方 `@deepseek-ai/dsh@0.1.1-rc.2` 与 pnpm `11.7.0` 验证。

### 可执行的失败诊断

- 只有受影响的包真实解析到 `store/v11/links`，且当前 dsh/Cordis Loader 出现已知加载错误时，SeekTTY 才会报告该精确条件，不再把它误称为普通缺少依赖。
- 恢复提示提供中英文说明，使用相同的逐命令兼容参数，并对展示给用户的命令做凭据脱敏。
- 不支持、无关或未来出现的新 Loader 错误不会被误判为这个已知问题。

### Release 门禁

- Windows、macOS、Linux 的 Node 22/24 矩阵共用同一个候选 tarball。
- GVS 关闭时，门禁在隔离环境安装官方 dsh 与 SeekTTY，再执行 add、boot、remove、re-add、第二次 boot、启动器隔离和 Host 模块身份检查。
- GVS 开启时，门禁确认真实 `store/v11/links` 布局。若上游已兼容则接受完整生命周期；否则必须同时命中当前精确 Loader 特征和 SeekTTY 恢复诊断。
- 单元测试覆盖命令构造、支持范围边界、错误分类、凭据脱敏以及包与文档合同。

### 兼容与升级

- 已测 Host：未修改的官方 `@deepseek-ai/dsh@0.1.1-rc.2`。
- Node.js：`^22.19.0 || >=24`。
- 不引入 Settings、Profile、Session、主题或插件 manifest 迁移。
- 本兼容版本不改变现有鼠标、输入、主题、欢迎页或代码高亮行为。
- Clarify 与 Auxiliary Runtime 仍是可选插件；本次发布不扩展它们的历史联合验收范围。

### Owner 发布边界

包继续保留 `private: true`。本 PR 只准备版本化源码、生成 bundle、双语文档和验证证据。Owner 必须审核精确候选包与 CI 矩阵，再单独决定是否创建 `v1.2.5` 与 GitHub Release。本候选不包含 npm Registry 发布步骤。
