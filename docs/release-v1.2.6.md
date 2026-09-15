# SeekTTY 1.2.6

## English

SeekTTY 1.2.6 is the release of the current main line with the native dsh `0.1.5-rc.1` adaptation.

## Changes

- Routes Session, Workspace, Settings, Provider, approval, question, subagent, attachment, and export flows through the official dsh `0.1.5-rc.1` controller and Remote contracts.
- Preserves the existing terminal workflows, transcript rendering, themes, background handling, mouse and native scrollback modes, plugin reconciliation, and pnpm 11 mutation guard.
- Keeps Harness as the owner of Agent, Session, model, Settings, permissions, Profile, plugin, and persistence state; no credentials or Session data are bundled.

## Compatibility

- Node.js: `^22.19.0 || >=24`
- Tested official Harness: `0.1.5-rc.1`
- Published package: `seektty@1.2.6`

The detailed interface comparison, migration decisions, verification evidence, and remaining platform limits are recorded in [the dsh 0.1.5-rc.1 adaptation record](dsh-0.1.5-rc.1-adaptation.md).

## 中文

SeekTTY 1.2.6 是当前 main 线的发布版本，完成了对官方 dsh `0.1.5-rc.1` 原生接口的适配。

- 会话、工作区、设置、Provider、审批、提问、子代理、附件和导出流程统一走官方 dsh `0.1.5-rc.1` 控制器与 Remote 合同。
- 保留已有终端工作流、对话渲染、主题、背景、鼠标与原生回滚、插件协调和 pnpm 11 变更保护。
- Harness 继续持有 Agent、Session、模型、Settings、权限、Profile、插件与持久化状态；发布包不包含凭据或 Session 数据。

详细接口对比、迁移决策、验证证据与平台边界见 [dsh 0.1.5-rc.1 适配记录](dsh-0.1.5-rc.1-adaptation.md)。
