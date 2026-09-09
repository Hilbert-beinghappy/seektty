# #197：复杂内容准备与快照重复工作后续

用户将人工验收交由自己完成，授权继续解决技术缺口并沿用本地部署流程。本轮从官方 `main` 的 PR #200 合并提交 `bf8c454` 建立 `codex/native-tail-197-bounded`，原工作区改动保留。菜单滚轮仍是观察项。

## 已确认的问题与处理

一万个 Markdown 列表项在 Windows 同步渲染约 194ms（单次定位样本，非正式性能结论）。原来的 256 行写入分页发生在完整解析、排版之后，不能保护输入线程。

- 超过 32768 UTF-16 单元的复杂 Markdown、巨长代码行以及大型混合展示节点使用包内 worker。阈值只选择执行位置，不截断源码，也不宣称语法在这个位置稳定。
- worker 复用 pi-tui 0.73.1 的完整 parser、主题、选择投影以及原有 CodeRow/Transcript 布局。列表、表格、引用和后到链接定义继续按完整文档解释；补齐 worker 内发现的延迟语法加载。
- 主线程仅接收一页，终端成功交付后才请求下一页。至多两个 worker 同时运行；候选路径以外不创建 worker。解析后的完整布局保留在 worker，最后一页取出或取消后释放。
- 大型活动回复维持可变尾部；新快照合并到下一次准备，准备时保留同宽度、同主题的上一版可见尾部。最终 settled/正常退出必须等待当前权威来源，不能把“暂时没有可写批次”当成已经完成。
- 已开始交付的版本按序完成，再输出带来源标记的修订。页面准备或取出不会提前确认源码。取消、Session 切换、来源移除、模式切换终止对应任务；准备失败明确抛出错误，不产生成功回执、不重试正文。
- resize 时，已开始提交的旧宽度文档仍保持来源身份，尚未交付的页面按新宽度再次换行，避免后续 Canvas 裁掉右侧正文。
- pi 的大数组参数展开改为循环追加，避免巨大列表/引用等触发函数实参数量上限；通用投影追加同样改为循环。
- 每个节点的精确来源 token 只生成一次，再组合展示偏好；不再为 native 另做一次相同来源遍历。高度索引初始估算改用 Map 查询，移除每个 key 再 `blocks.find` 的平方级查找。

新增 worker 是显示层设施，不持有 Session、日志、权限、设置或 Profile 的写入权。包内默认和 full 模式保持原路径；没有修改官方 Harness、合并、发布或关闭 issue。

## 尚不能宣称解决的技术边界

1. 固定版本官方接口仍只有无参数 `Session.subscribe`，`ChatNodeStore` 是实时 reader，没有可靠 changed keys / revision。精确快照调和仍为 O(H)，来源与顺序检查仍在 `update` 内，未转移到别的回调以隐藏成本。消除这个剩余量级需要官方一致的增量接口；本轮没有扩大到修改 Harness。
2. 不稳定列表、表格等仍须完整解析。worker 将解析/高亮/排版从输入线程隔离，但没有把整份文档的总 CPU 和内存变成常量。worker 峰值内存随该不稳定文档 A 增长；主线程传递字符串、构造展示行和精确比较仍可能随 A 增长。不要将线程隔离称为通用增量 Markdown parser。
3. 部分物理交付与完整源码提交仍不同。取消后不自动重发不确定片段；显式回放或后续修订可以有标记地重输出权威内容。没有新增任意物理行到源码位置的无损反向映射。

人工终端、UU 和完整性能矩阵由用户负责，不是本轮暂停实施的理由。上述官方接口和计算量边界则是技术事实，不能算作用户承担的验收工作。

## 必要验证

回归覆盖：复杂文档与共享权威渲染逐行一致、巨长代码行中文/Emoji/源空格、混合思考节点、慢写入后同 key 缩短修订、重复快照、取消和 Session 切换、模式切换、保持旧预览、缩窄宽度后续页原文覆盖、正常退出等待、worker 失败和最多两个并发 worker。

官方 dsh 0.1.1-rc.2 的隔离 install → boot → remove → reinstall 额外验证打包 worker 能从实际 Profile 启动并响应页面协议。消费包没有新增 workspace 依赖，`dsh.bundle.patch` 和官方模块身份检查保留。

Windows 与 Debian 的最终代码均通过 typecheck、155 个测试文件（1412 项通过、1 项原有跳过）、build 和 pack-check（28 个包条目）。两平台的官方 dsh 隔离周期均通过，包含安装后与重装后的实际打包 worker 启动。首次全检查因新生成的共享 chunk 尚未进入 Git index 触发包契约测试失败；将生成文件纳入提交后最终检查通过，没有放宽检查。

原始日志在本工作树 `.artifacts/bounded-*` 和 Debian `/tmp/native197-bounded-*`。本轮只保留必要回归和启动检查，不把这些结果表述成用户负责的完整人工/性能验收。

## 最终本地部署

- 代码提交 `6cfa484b675fafb3b11e2540b5ab2184ea1e9a8f`；构建名 `native197-bounded-20260907T174400`（UTC 命名）。
- 两平台安装同一个本地 tarball：`seektty-1.2.5-native197-bounded-20260907T174400.tgz`，SHA-256 为 `8bdbaa00dac677638aa69c07a4556b0bf26b9a3b04f525af02b7bfaf045a2913`。
- `lib/index.js` SHA-256 为 `00616d878cbc58ac5919079102a60eaaf2abbb81a33db61a1c61c56fe22a6bfc`。部署验证另外逐一核对全部 14 个打包 JS 文件，包括 worker 和共享 chunk，避免只验证入口文件。
- Windows 全局包为 `F:/nodejs/node_global/v11/1064-1a07cf89dd1/node_modules/seektty`，Profile 为 `C:/Users/bymay/.dsh/profiles/tui`；常用 CMD 与 PowerShell `deepseek` 均完成启动、打开帮助、正常退出检查。
- Debian 全局包为 `/opt/pnpm-global/v11/16-1a07cf8c8a5/node_modules/seektty`，Profile 为 `/home/bymay/.dsh/profiles/tui`；常用 `/usr/local/bin/deepseek` 在直接 PTY 与独立 tmux 均完成相同启动检查。
- 全局和 Profile 的全部 JS hash 与本地包一致；原 bundles 列表不变。安装后及启动检查后，官方 dsh、顶层 settings 和 credentials hash 保持原值。没有停止用户原有会话；需退出重开使用新包。
- 两边启动器继续默认 `SEEKTTY_NATIVE_TAIL=1`，显式 `0` 保留，PowerShell 结束后恢复调用前环境。
- 备份位于 Windows `C:/Users/bymay/.local/share/seektty/backups/native197-bounded-20260907T174400/windows` 和 Debian `/home/bymay/.local/share/seektty/backups/native197-bounded-20260907T174400/linux`。其中保留上一版本包（SHA-256 `2f6c329a9e65415b299d096f31f3b74860d829d5158409c72e8cfef98f87d6a0`）、启动器、安装代码及 Profile 元数据。
