# DeepSeek TUI

[English](README.md) | 中文

DeepSeek TUI 是独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Profile Bundle。Harness 继续负责 Agent、Session、模型、设置、权限、Profile、插件和持久化；本仓库只提供 DeepSeek 配色的终端 Surface 和必要的兼容适配层，不再维护 Harness fork。

## 安装并使用裸命令

仓库目前是私有的，安装者需要拥有 GitHub 访问权限。

```sh
pnpm add --global github:Hilbert-beinghappy/deepseek-tui
deepseek
```

`deepseek` 首次运行会通过原生 `dsh plugin` 命令创建默认 `tui` Profile 并安装本 Bundle，以后直接启动同一 Profile。它支持初始任务、工作区、会话恢复和自定义 Profile：

```sh
deepseek "检查这个项目"
deepseek --cwd ../project
deepseek --resume
deepseek --resume <sessionId>
deepseek --profile team-tui
```

也可以只使用 dsh 的原生入口：

```sh
dsh plugin --profile tui add github:Hilbert-beinghappy/deepseek-tui
dsh --profile tui
```

## 直接插拔

移除不会修改 dsh 本体，只会让 Bundle 离开目标 Profile：

```sh
dsh plugin --profile tui remove deepseek-tui
```

重新安装使用相同命令：

```sh
dsh plugin --profile tui add github:Hilbert-beinghappy/deepseek-tui
```

本包声明标准 `dsh.bundle.patch`，不建立第二套插件数据库、Profile 格式、Session Store、模型适配器、设置 Store 或权限系统。

## 模型和设置

模型目录、Provider、推理强度、凭据和全部非外观设置都来自 Harness。请通过 TUI 的 `/model`、`/settings` 或 Harness 原生设置配置；密钥不属于本插件，也不能提交到仓库。

## 已验证范围

- 官方 stock `@deepseek-ai/dsh@0.1.0-rc.6` 隔离安装、配置装配和 PTY 启动。
- `/doctor`：95 个 Harness 插件运行，0 error，0 warning。
- 模型列表、Provider／模型／推理强度切换、请求提交和 Harness 错误透传。
- 原生 remove 后依赖、Bundle 和配置条目全部消失；re-add 后再次启动成功。
- 全新全局安装的裸 `deepseek` 自动创建并启动 `tui` Profile。
- macOS 和 Linux；不支持 Windows。

成功的外部在线模型回复仍需要调用环境提供有效凭据。本次隔离环境中的 OpenAI 凭据被上游判定无效，且没有 DeepSeek 凭据，因此在线成功响应不在当前验收结论内。

可复用的 stock-dsh 插拔检查：

```sh
DSH_BIN=/path/to/dsh \
DEEPSEEK_TUI_SPEC=/path/to/deepseek-tui.tgz \
pnpm test:stock
```

## 兼容和升级

当前只承诺官方 `0.1.0-rc.6`。dsh 更新时不需要把本仓库重新合并成 fork；需要更新这里的精确依赖和兼容快照，再跑 add／boot／remove／re-add 契约。通过后才能扩大兼容范围。

仓库保持私有；未经明确授权，不发布 npm 包或公开 Release。
