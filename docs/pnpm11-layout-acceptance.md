# pnpm 11 GVS compatibility acceptance / pnpm 11 GVS 兼容验收

- Date / 日期: 2026-08-30
- Candidate / 候选版本: SeekTTY `1.2.4`
- Host: unmodified official `@deepseek-ai/dsh@0.1.1-rc.2`
- Package manager: pnpm `11.7.0`

## Scope / 范围

This record covers the temporary package-layout adapter only. It does not authorize an npm publication, remove `private: true`, change the package name, configure a Trusted Publisher, or claim real-terminal acceptance on unavailable systems.

本记录只覆盖临时包布局适配器，不授权 npm 发布、不删除 `private: true`、不改变包名、不配置 Trusted Publisher，也不把尚未具备设备的系统标记为真实终端验收通过。

SeekTTY adds `--config.enable-global-virtual-store=false` to package-tree mutations that it owns. It does not change global pnpm configuration, set `NODE_PATH`, install a duplicate Host graph, or bypass native `dsh plugin` reconciliation.

SeekTTY 会给自身发起的包树变更附加 `--config.enable-global-virtual-store=false`，但不会修改全局 pnpm 配置、设置 `NODE_PATH`、安装第二套 Host 依赖图或绕过原生 `dsh plugin` 协调。

## Automated contract / 自动化合同

The cross-platform gate consumes one uploaded candidate tarball and runs on Windows, macOS, and Linux with Node 22 and 24:

跨平台门禁使用同一个上传的候选 tarball，在 Windows、macOS、Linux 的 Node 22 和 24 上运行：

```sh
pnpm test:pnpm11-layout false .artifacts
pnpm test:pnpm11-layout true .artifacts
```

- `GVS=false`: install official dsh and SeekTTY into isolated `PNPM_HOME`, store, global directory, and `DSH_HOME`; assert that real package paths do not use `store/v11/links`; then complete add, dump-config, full boot, remove, re-add, second full boot, launcher isolation, and Host module-identity checks.
- `GVS=true`: assert that both real package paths do use `store/v11/links`; accept a successful full lifecycle if upstream becomes compatible, otherwise require the exact dsh/Cordis loader signature and SeekTTY's per-command recovery diagnosis.

- `GVS=false`：把官方 dsh 与 SeekTTY 安装到隔离的 `PNPM_HOME`、store、global directory 和 `DSH_HOME`，断言真实包路径不位于 `store/v11/links`，再完成 add、dump-config、完整 boot、remove、re-add、第二次完整 boot、启动器隔离和 Host 模块身份检查。
- `GVS=true`：断言两个包的真实路径都位于 `store/v11/links`；若上游已经兼容则接受完整生命周期成功，否则必须同时命中精确的 dsh/Cordis Loader 特征与 SeekTTY 的逐命令恢复诊断。

## Local evidence / 本机证据

| Environment | GVS=false | GVS=true |
| --- | --- | --- |
| Windows, pnpm `11.7.0`, Node `26.1.0`, official dsh `0.1.1-rc.2` | Passed full stock lifecycle | Real paths entered `store/v11/links`; known `plugin tree failed to load` / `cordis:include` failure was classified and recovery included the per-command option |
| macOS | Not run locally; CI gate added, result pending | Not run locally; CI gate added, result pending |
| Linux | Not run locally; CI gate added, result pending | Not run locally; CI gate added, result pending |

The Windows run used the exact generated `seektty-1.2.4.tgz`. Automated process tests do not replace manual GUI-terminal, clipboard, or interaction acceptance.

Windows 本机运行使用了实际生成的 `seektty-1.2.4.tgz`。自动进程测试不等价于 GUI 终端、剪贴板或交互行为的人工验收。

## Exit condition / 退出条件

Keep the adapter while any supported and tested dsh release fails the positive GVS lifecycle. Remove it only after an upstream Host passes GVS=true on the release matrix, then update the exact compatibility range and user commands in the same change.

只要受支持且已测试的 dsh 版本仍不能通过 GVS=true 正向生命周期，就继续保留该适配器。只有上游 Host 在发布矩阵通过 GVS=true 后，才可在同一次改动中移除适配器，并同步更新精确兼容范围和用户命令。
