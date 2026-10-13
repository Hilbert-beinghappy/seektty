# SeekTTY 1.3.0 — complete PR and release-note audit

## Scope and method

Snapshot date: **2026-10-13**, covering the PR inventory through **PR212**, before this release-preparation PR. Source baseline: **37c8cdff7bc15b2057bf5256209ff3e88a449aaf**. Previous release tag: **v1.2.6**.

The audit reads all GitHub PR records, every published GitHub Release from v1.0.0 through v1.2.6, and the repository's release-v1.2.3/4/5/6 notes and verification records. Git ancestry identifies the first released tree containing each merged PR. Note coverage is assessed from described behavior, not merely whether a PR number appears: a broad “existing workflows” or “related TUI fixes” sentence is recorded as a summary rather than a detailed declaration.

There are **183 PR records**: **72 marked merged**, **111 closed without an individual merge**, and **0 open**. Of the merged PRs, **71** are in this main baseline. PR207 was merged into another branch and is excluded. The **108** original source PRs #6–#113 were consolidated/adapted through PR114 and PR115; counting them as 108 additional new release changes would duplicate the original integration.

| Coverage of the 72 merged PRs | Count | How 1.3.0 records it |
| --- | ---: | --- |
| Already described in older release notes | 28 | Retain the historical release credit |
| Previously only summarized | 23 | Add individual behavior descriptions |
| No specific declaration in older release notes | 15 | Add the missing history, including documentation-only PRs |
| Main changes after v1.2.6 | 5 | Describe as newly shipped code/documentation |
| Merged outside this release tree | 1 | Exclude; do not claim the fix shipped |

Thus **38 earlier merged PRs** receive a more specific historical record, alongside **5 newly released main PRs**. “Already shipped” and “new in 1.3.0” are kept separate. The ledger below covers every merged PR once; the final two tables cover every closed source/preview PR once, for all 183 records.

中文：本统计同时核对 GitHub 合并记录、正式 Release 正文、仓库发布文档与 Git 提交祖先。以前只用“保留已有功能”“相关修复”等一句话概括的内容单独归类，不误称为完全没有提及。38 个旧 PR 补充逐项说明，5 个主线 PR 随 1.3.0 首次发布。最初经 #114／#115 整合的 108 个来源 PR 单独列出，避免重复计为新增；#207 虽显示已合并，但未进入当前主线。

## Newly released main PRs / 本次首次发布

| PR | First shipped | Title | Coverage or behavior |
| --- | --- | --- | --- |
| [#208](https://github.com/Hilbert-beinghappy/seektty/pull/208) | v1.3.0 | fix(compat): adapt to dsh 0.1.5-rc.2 and repair upgrade checks | Moves development compatibility to dsh 0.1.5-rc.2 and fixes upgrade preflight/version assertions. |
| [#209](https://github.com/Hilbert-beinghappy/seektty/pull/209) | v1.3.0 | docs: correct SeekTTY 1.2.6 publication status | Corrects the 1.2.6 npm/GitHub publication record; documentation only. |
| [#210](https://github.com/Hilbert-beinghappy/seektty/pull/210) | v1.3.0 | fix(compat): validate official dsh 0.1.5-rc.3 | Validates dsh 0.1.5-rc.3, matches official Host pins, and isolates NODE_PATH in package acceptance. |
| [#211](https://github.com/Hilbert-beinghappy/seektty/pull/211) | v1.3.0 | fix(compat): adapt SeekTTY to dsh 0.2.0-rc.2 | Adapts native contracts and minimum/tested Host to dsh 0.2.0-rc.2; fixes Windows/Node22 acceptance portability. |
| [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212) | v1.3.0 | feat: add native rc.2 terminal workflows and harden integration boundaries | Adds native terminal workflows, files/input extensions, optional compositions and WAV input; fixes stale-target, approval, stream, cleanup, and Host assembly boundaries. |

## Earlier omissions / 此前遗漏的具体说明

| PR | First shipped | Title | Coverage or behavior |
| --- | --- | --- | --- |
| [#139](https://github.com/Hilbert-beinghappy/seektty/pull/139) | v1.0.2 | fix(tui): stop history-replay flicker and show live reasoning | Redraws stay within the visible viewport, preventing history replay flashes; live reasoning remains visible. |
| [#143](https://github.com/Hilbert-beinghappy/seektty/pull/143) | v1.2.1 | docs: explain the Clarify-to-Plan workflow | README explains Clarify → Plan, ownership, draft review, and usage provenance; documentation only. |
| [#144](https://github.com/Hilbert-beinghappy/seektty/pull/144) | v1.2.1 | docs(readme): add SeekTTY logo | Adds the SeekTTY logo to both READMEs and the package allowlist; presentation/documentation only. |
| [#148](https://github.com/Hilbert-beinghappy/seektty/pull/148) | v1.2.2 | docs: streamline bilingual README | Streamlines and synchronizes English/Chinese README; documentation only. |
| [#156](https://github.com/Hilbert-beinghappy/seektty/pull/156) | v1.2.4 | docs: remove keyboard-first wording from README | Removes keyboard-first wording after mouse support; documentation only. |
| [#188](https://github.com/Hilbert-beinghappy/seektty/pull/188) | v1.2.6 | 修复主题导入即时生效与代理树鼠标坐标错位 | Imported themes apply immediately to interface/code; Agent Tree height no longer shifts mouse/selection targets. |
| [#189](https://github.com/Hilbert-beinghappy/seektty/pull/189) | v1.2.6 | fix(update): detect SeekTTY versions from npm latest | SeekTTY update discovery follows npm latest rather than GitHub tag conversion. |
| [#191](https://github.com/Hilbert-beinghappy/seektty/pull/191) | v1.2.6 | feat(tui): 增加语义化分级右键菜单并修复 overlay 生命周期 | Adds target-specific context menus and submenus, explicit Session targets, correct overlay order, and list refresh. |
| [#192](https://github.com/Hilbert-beinghappy/seektty/pull/192) | v1.2.6 | 修复：按语义复制 transcript 选中文本 | Copies semantic source text without display padding/borders/line numbers, retaining real indentation and hard newlines. |
| [#198](https://github.com/Hilbert-beinghappy/seektty/pull/198) | v1.2.6 | fix(tui): 局部刷新 Welcome，避免流式更新清空历史缓存 (#196) | Welcome facts invalidate only the welcome presentation rather than completed-history caches. |
| [#199](https://github.com/Hilbert-beinghappy/seektty/pull/199) | v1.2.6 | perf(tui): 减少长对话流式渲染重复计算，优先响应键盘输入 | Reuses stable render/highlight work and prioritizes keyboard drawing during long streams. |
| [#200](https://github.com/Hilbert-beinghappy/seektty/pull/200) | v1.2.6 | feat(native): 分离已提交历史与活动尾部的候选路径 (#197) | Adds opt-in SEEKTTY_NATIVE_TAIL=1 with committed-history/active-tail separation and guarded serial delivery. |
| [#201](https://github.com/Hilbert-beinghappy/seektty/pull/201) | v1.2.6 | 修复 #183：自动发现并导入 VS Code 主题 | Discovers VS Code/Insiders/Cursor themes and supports local/HTTPS imports, relative includes, and manual updates. |
| [#202](https://github.com/Hilbert-beinghappy/seektty/pull/202) | v1.2.6 | fix(native): isolate large transcript preparation and bound delivery | Moves large native transcript preparation to bounded packaged workers and delivers one page at a time. |
| [#206](https://github.com/Hilbert-beinghappy/seektty/pull/206) | v1.2.6 | fix(native): preserve restarted assistant streams and initial jobs | Restarted child streams become visible immediately; initial jobs snapshots survive subscription ordering. |

## Earlier summaries expanded / 此前概括说明的补充

| PR | First shipped | Title | Coverage or behavior |
| --- | --- | --- | --- |
| [#3](https://github.com/Hilbert-beinghappy/seektty/pull/3) | v1.0.0 | Fix Esc to navigate back one overlay level | Escape returns one overlay level and keeps parent page state; the later 1.0.1 note only groups overlay follow-ups. |
| [#117](https://github.com/Hilbert-beinghappy/seektty/pull/117) | v1.0.1 | fix(tui): keep slash-command overlays on one Esc back stack | Slash-command child pages share one Escape Back stack instead of closing the entire flow. |
| [#118](https://github.com/Hilbert-beinghappy/seektty/pull/118) | v1.0.1 | fix(tui): surface daily commands first and hide catalog aliases | Daily slash commands appear first; compatible aliases remain executable without duplicating catalog rows. |
| [#119](https://github.com/Hilbert-beinghappy/seektty/pull/119) | v1.0.1 | fix(tui): run local palette commands without a second Enter | Choosing a local palette command opens its action immediately without a second Enter. |
| [#120](https://github.com/Hilbert-beinghappy/seektty/pull/120) | v1.0.1 | fix(tui): focus /queue on messages instead of bulk actions | Queue messages appear before bulk actions, avoiding accidental whole-queue operations. |
| [#121](https://github.com/Hilbert-beinghappy/seektty/pull/121) | v1.0.1 | fix(tui): stay quiet when a queue edit is cancelled | Cancelling a queue edit does not show a false success notice. |
| [#122](https://github.com/Hilbert-beinghappy/seektty/pull/122) | v1.0.1 | fix(tui): stop treating Tab as confirm inside selectors | Tab does not confirm a selector; Enter remains the explicit confirmation. |
| [#123](https://github.com/Hilbert-beinghappy/seektty/pull/123) | v1.0.1 | fix(tui): keep first-open examples and F1 on daily work | First-open/help copy focuses on everyday work; later welcome-page changes replace the old starter examples. |
| [#124](https://github.com/Hilbert-beinghappy/seektty/pull/124) | v1.0.1 | fix(tui): keep attachments when Ctrl+C clears draft text | Clearing draft text with idle Ctrl+C preserves attached images; an image-only draft still has an explicit clear action. |
| [#125](https://github.com/Hilbert-beinghappy/seektty/pull/125) | v1.0.1 | fix(tui): let Ctrl+C stop generation while an overlay is open | Ctrl+C can stop generation while an overlay is open. |
| [#126](https://github.com/Hilbert-beinghappy/seektty/pull/126) | v1.0.1 | fix(tui): keep failure advice on one status-bar line | Failure advice fits a single actionable status-bar line. |
| [#127](https://github.com/Hilbert-beinghappy/seektty/pull/127) | v1.0.1 | fix(tui): say /restart once when a setting needs a restart | Restart-required Settings show one durable /restart instruction. |
| [#128](https://github.com/Hilbert-beinghappy/seektty/pull/128) | v1.0.1 | fix(tui): hide Settings fields that already have dedicated editors | Settings do not duplicate fields that already have dedicated editors. |
| [#129](https://github.com/Hilbert-beinghappy/seektty/pull/129) | v1.0.1 | fix(tui): keep important status above ephemeral notices | Durable status facts take priority over temporary notices. |
| [#130](https://github.com/Hilbert-beinghappy/seektty/pull/130) | v1.0.1 | fix(tui): describe pending work instead of teaching /pending | Pending status names approvals/questions instead of routinely teaching /pending. |
| [#131](https://github.com/Hilbert-beinghappy/seektty/pull/131) | v1.0.1 | fix(tui): show generation progress only in the context bar | Generation progress appears in the context bar rather than two competing status rows. |
| [#132](https://github.com/Hilbert-beinghappy/seektty/pull/132) | v1.0.1 | fix(tui): keep tool approval on one navigation stack | Tool-approval details share one navigation stack. |
| [#133](https://github.com/Hilbert-beinghappy/seektty/pull/133) | v1.0.1 | fix(tui): silence navigation toasts and shorten overlay footers | Navigation avoids redundant success toasts and uses shorter overlay footers. |
| [#134](https://github.com/Hilbert-beinghappy/seektty/pull/134) | v1.0.1 | fix(tui): keep question answers when continuing after Esc | Continuing questions after Escape retains the answers already given. |
| [#135](https://github.com/Hilbert-beinghappy/seektty/pull/135) | v1.0.1 | fix(tui): explain send, command, and stop failures the same way | Sending, commands, and stop failures use consistent actionable error feedback. |
| [#186](https://github.com/Hilbert-beinghappy/seektty/pull/186) | v1.2.6 | feat(subagents): add hierarchical session tree and child navigation | Adds hierarchical Agent Tree, child/grandchild navigation, status, and parent-view restoration. |
| [#193](https://github.com/Hilbert-beinghappy/seektty/pull/193) | v1.2.6 | feat(models): add native multi-provider configuration | Adds one native Provider manager for onboarding/models/Settings, schema-based edits, discovery, and explicit route selection. |
| [#195](https://github.com/Hilbert-beinghappy/seektty/pull/195) | v1.2.6 | feat(tui): independent rendering and native scrollback | Separates RGB/color encoding, row fill, and OSC sync; adds native scrollback and fixes mutable assistant/tool tails. |

## Already described / 已有正式说明

| PR | First shipped | Title | Coverage or behavior |
| --- | --- | --- | --- |
| [#1](https://github.com/Hilbert-beinghappy/seektty/pull/1) | v1.0.0 | feat: release SeekTTY v1.0.0 | Initial terminal baseline, bilingual/Windows launcher, onboarding, approvals and package gates. |
| [#4](https://github.com/Hilbert-beinghappy/seektty/pull/4) | v1.0.0 | Add English interface and Windows support | Initial terminal baseline, bilingual/Windows launcher, onboarding, approvals and package gates. |
| [#5](https://github.com/Hilbert-beinghappy/seektty/pull/5) | v1.0.0 | feat(onboarding): add first-run API key setup | Initial terminal baseline, bilingual/Windows launcher, onboarding, approvals and package gates. |
| [#114](https://github.com/Hilbert-beinghappy/seektty/pull/114) | v1.0.0 | release: integrate SeekTTY 1.0.0 feature and review-fix stack | Initial terminal baseline, bilingual/Windows launcher, onboarding, approvals and package gates. |
| [#115](https://github.com/Hilbert-beinghappy/seektty/pull/115) | v1.0.0 | Merge SeekTTY 1.0.0 integration into main | Initial terminal baseline, bilingual/Windows launcher, onboarding, approvals and package gates. |
| [#116](https://github.com/Hilbert-beinghappy/seektty/pull/116) | v1.0.1 | fix(compat): ignore official host.describe 0.0.1 placeholder | host.describe placeholder; grouped approval/status/overlay/Ctrl+C/question/catalog follow-ups. |
| [#140](https://github.com/Hilbert-beinghappy/seektty/pull/140) | v1.0.2 | release: SeekTTY 1.0.2 | dsh rc.8, launcher/attachment/prompt-error handling; no individual replay/reasoning fix description. |
| [#141](https://github.com/Hilbert-beinghappy/seektty/pull/141) | v1.1.0 | feat(clarify): add optional TUI shell | Optional Clarify terminal shell and capability detection. |
| [#142](https://github.com/Hilbert-beinghappy/seektty/pull/142) | v1.2.0 | feat(clarify): add dynamic review-first TUI flow | Dynamic review-first Clarify, usage provenance, Host identity and stale-response protection. |
| [#145](https://github.com/Hilbert-beinghappy/seektty/pull/145) | v1.2.1 | docs(readme): clarify plugin-backed command | Official dsh 0.1.1-rc.2 adaptation and retained Clarify/attachment flows. |
| [#146](https://github.com/Hilbert-beinghappy/seektty/pull/146) | v1.2.1 | SeekTTY 1.2.1: retarget official dsh 0.1.1-rc.2 and keep 0.1.0-rc.8 (draft, not a Release) | Official dsh 0.1.1-rc.2 adaptation and retained Clarify/attachment flows. |
| [#150](https://github.com/Hilbert-beinghappy/seektty/pull/150) | v1.2.2 | fix(tui): stabilize viewport rendering and improve long-session performance | Long-session rendering, viewport bounds and display residue fixes. |
| [#153](https://github.com/Hilbert-beinghappy/seektty/pull/153) | v1.2.3 | feat: release SeekTTY 1.2.3 with complete mouse support | Application mouse/selection/scrollbar/clipboard interaction. |
| [#154](https://github.com/Hilbert-beinghappy/seektty/pull/154) | v1.2.4 | release: prepare v1.2.4 mouse and input fixes | User-message rules, navigation/selection/input fixes, release preparation. |
| [#155](https://github.com/Hilbert-beinghappy/seektty/pull/155) | v1.2.4 | feat(tui): frame sent user messages with composer rules | User-message rules, navigation/selection/input fixes, release preparation. |
| [#160](https://github.com/Hilbert-beinghappy/seektty/pull/160) | v1.2.4 | docs(release): finalize v1.2.4 release notes and verification | User-message rules, navigation/selection/input fixes, release preparation. |
| [#162](https://github.com/Hilbert-beinghappy/seektty/pull/162) | v1.2.5 | fix(tui): synchronize terminal background with the active theme | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#164](https://github.com/Hilbert-beinghappy/seektty/pull/164) | v1.2.5 | feat(tui): inherit terminal background effects with configurable modes | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#165](https://github.com/Hilbert-beinghappy/seektty/pull/165) | v1.2.5 | fix(overlays): use available width for option descriptions | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#169](https://github.com/Hilbert-beinghappy/seektty/pull/169) | v1.2.5 | fix(tui): repair permission switching and error feedback | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#170](https://github.com/Hilbert-beinghappy/seektty/pull/170) | v1.2.5 | fix(tui): adapt canvas contrast and refresh theme selection | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#172](https://github.com/Hilbert-beinghappy/seektty/pull/172) | v1.2.5 | feat(transcript): toggle Thinking while streaming | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#177](https://github.com/Hilbert-beinghappy/seektty/pull/177) | v1.2.5 | refactor(theme): 统一透明表面、Hover 与底部交互 | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#178](https://github.com/Hilbert-beinghappy/seektty/pull/178) | v1.2.5 | feat: 实现 VS Code 视觉级 TextMate 高亮 | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#180](https://github.com/Hilbert-beinghappy/seektty/pull/180) | v1.2.5 | fix: 修正对话控件命中与工具卡折叠 | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#182](https://github.com/Hilbert-beinghappy/seektty/pull/182) | v1.2.5 | release: prepare SeekTTY 1.2.5 for Owner review | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#184](https://github.com/Hilbert-beinghappy/seektty/pull/184) | v1.2.5 | release: enable npm publication for SeekTTY 1.2.5 | Welcome, background, TextMate, Thinking, permission/click fixes and npm publication. |
| [#205](https://github.com/Hilbert-beinghappy/seektty/pull/205) | v1.2.6 | feat(compat): 适配官方 dsh 0.1.5-rc.1 并补齐原生交互回归 | dsh 0.1.5-rc.1 API migration; existing flows are named broadly, without individual feature/fix details. |

## Merged outside the release / 非本次发布树

| PR | First shipped | Title | Coverage or behavior |
| --- | --- | --- | --- |
| [#207](https://github.com/Hilbert-beinghappy/seektty/pull/207) | Not in main | fix(tui): prevent progressive stream stalls and hover flicker | Merged only into codex/fix-native-activation-jobs. The merge and its stall/hover changes are absent from this main baseline. |

## Consolidated 1.0.0 source PRs / 1.0.0 集成来源

[PR114](https://github.com/Hilbert-beinghappy/seektty/pull/114) explicitly records the squash of the #18–#113 stack and the adapted/superseded #6–#17 fixes; [PR115](https://github.com/Hilbert-beinghappy/seektty/pull/115) brings that final tree into main. These PRs were closed as superseded, not merged individually. Titles below identify the original work; later review fixes and newer releases may replace the original proposal. For example, the queue reorder proposal (#27) was narrowed by #68, and client tool-name auto-allow was removed by #69. The list is provenance, not a claim that every original proposal is still available unchanged.

| Source PR | Original title | Delivery record |
| --- | --- | --- |
| [#6](https://github.com/Hilbert-beinghappy/seektty/pull/6) | fix(tui): restore idle Ctrl+C drafts from editor history | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#7](https://github.com/Hilbert-beinghappy/seektty/pull/7) | fix(tui): default dangerous confirms onto cancel | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#8](https://github.com/Hilbert-beinghappy/seektty/pull/8) | fix(tui): confirm before discarding a question batch on Escape | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#9](https://github.com/Hilbert-beinghappy/seektty/pull/9) | fix(tui): shadow colliding Host commands instead of failing the catalog | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#10](https://github.com/Hilbert-beinghappy/seektty/pull/10) | fix(ci): gate PRs on check and a rebuilt lib tree | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#11](https://github.com/Hilbert-beinghappy/seektty/pull/11) | fix(launcher): spawn dsh through cross-spawn on Windows (P0-10) | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#12](https://github.com/Hilbert-beinghappy/seektty/pull/12) | fix(launcher): classify first-run spawn and manifest failures (P0-7) | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#13](https://github.com/Hilbert-beinghappy/seektty/pull/13) | fix(launcher): wait in deepseek for /restart instead of orphaning dsh (P0-9) | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#14](https://github.com/Hilbert-beinghappy/seektty/pull/14) | fix(tui): restore the terminal on crash and termination signals (P0-11) | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#15](https://github.com/Hilbert-beinghappy/seektty/pull/15) | fix(tui): render line-level hunks instead of whole-file diffs (P0-3) | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#16](https://github.com/Hilbert-beinghappy/seektty/pull/16) | fix(tui): show the pending tool command and diff in approval overlays (P0-2) | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#17](https://github.com/Hilbert-beinghappy/seektty/pull/17) | fix(tui): stream plugin install progress instead of a frozen overlay (P0-5) | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#18](https://github.com/Hilbert-beinghappy/seektty/pull/18) | feat(tui): persist SeekTTY interaction defaults in seektty-behavior | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#19](https://github.com/Hilbert-beinghappy/seektty/pull/19) | feat(tui): persist composer history and search it with Ctrl+R | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#20](https://github.com/Hilbert-beinghappy/seektty/pull/20) | feat(tui): show live turn duration on the status strip | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#21](https://github.com/Hilbert-beinghappy/seektty/pull/21) | feat(tui): ring BEL and OSC 9 when a turn finishes or waits | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#22](https://github.com/Hilbert-beinghappy/seektty/pull/22) | feat(tui): follow the current session in the terminal title | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#23](https://github.com/Hilbert-beinghappy/seektty/pull/23) | feat(tui): add /copy pick and code with clipboard fallbacks | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#24](https://github.com/Hilbert-beinghappy/seektty/pull/24) | feat(tui): show relative updated time in the session list | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#25](https://github.com/Hilbert-beinghappy/seektty/pull/25) | feat(tui): add incremental transcript search in focus mode | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#26](https://github.com/Hilbert-beinghappy/seektty/pull/26) | feat(tui): stop background jobs and refresh live overlays | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#27](https://github.com/Hilbert-beinghappy/seektty/pull/27) | feat(tui): reorder and clear the input queue | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#28](https://github.com/Hilbert-beinghappy/seektty/pull/28) | feat(tui): add a multiline overlay for queue edits and custom answers | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#29](https://github.com/Hilbert-beinghappy/seektty/pull/29) | feat(tui): attach clipboard bitmaps on empty paste | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#30](https://github.com/Hilbert-beinghappy/seektty/pull/30) | feat(tui): export Markdown transcripts and human-size ZIP notices | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#31](https://github.com/Hilbert-beinghappy/seektty/pull/31) | feat(tui): list produced files across the whole session | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#32](https://github.com/Hilbert-beinghappy/seektty/pull/32) | feat(tui): add partitioned /help and bind F1 | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#33](https://github.com/Hilbert-beinghappy/seektty/pull/33) | fix(tui): turn opaque errors into what happened and what to do | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#34](https://github.com/Hilbert-beinghappy/seektty/pull/34) | feat(tui): remember per-session tool approvals | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#35](https://github.com/Hilbert-beinghappy/seektty/pull/35) | feat(tui): print --version, pin the install spec, and check dsh | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#36](https://github.com/Hilbert-beinghappy/seektty/pull/36) | feat(tui): offer Enter-to-send examples on an empty session | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#37](https://github.com/Hilbert-beinghappy/seektty/pull/37) | feat(tui): fold long tool output and persist the line cap | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#38](https://github.com/Hilbert-beinghappy/seektty/pull/38) | feat(tui): expand a single tool card with Enter in focus mode | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#39](https://github.com/Hilbert-beinghappy/seektty/pull/39) | feat(tui): search settings fields across namespaces | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#40](https://github.com/Hilbert-beinghappy/seektty/pull/40) | feat(tui): let /keymap rebind surface shortcuts | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#41](https://github.com/Hilbert-beinghappy/seektty/pull/41) | feat(tui): export a theme as exclusive JSON | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#42](https://github.com/Hilbert-beinghappy/seektty/pull/42) | feat(tui): shorten the first TUI frame on the startup path | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#43](https://github.com/Hilbert-beinghappy/seektty/pull/43) | feat(tui): stop marketplace search from downloading tarballs | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#44](https://github.com/Hilbert-beinghappy/seektty/pull/44) | feat(tui): describe one Settings namespace without repeating full dumps | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#45](https://github.com/Hilbert-beinghappy/seektty/pull/45) | feat(tui): cache Profile plugin snapshots across one pnpm add | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#46](https://github.com/Hilbert-beinghappy/seektty/pull/46) | feat(tui): abort in-flight marketplace and export work from Escape | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#47](https://github.com/Hilbert-beinghappy/seektty/pull/47) | fix(tui): keep marketplace hits when one catalog source fails | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#48](https://github.com/Hilbert-beinghappy/seektty/pull/48) | fix(tui): keep the plugin marketplace open when a catalog row is invalid | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#49](https://github.com/Hilbert-beinghappy/seektty/pull/49) | feat(tui): structure /trajectory request details instead of dumping JSON | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#50](https://github.com/Hilbert-beinghappy/seektty/pull/50) | fix(tui): degrade invalid restart handoff instead of blocking boot | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#51](https://github.com/Hilbert-beinghappy/seektty/pull/51) | fix(tui): warn when Cordis fiber.state is outside the known enum | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#52](https://github.com/Hilbert-beinghappy/seektty/pull/52) | feat(tui): persist diff context and cancel-first danger confirm | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#53](https://github.com/Hilbert-beinghappy/seektty/pull/53) | feat(tui): cache transcript rows by chat node during streaming | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#54](https://github.com/Hilbert-beinghappy/seektty/pull/54) | feat(tui): gate leftover Chinese copy behind ui/launcherCopy | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#55](https://github.com/Hilbert-beinghappy/seektty/pull/55) | feat(tui): move leftover notices onto ui() in small modules | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#56](https://github.com/Hilbert-beinghappy/seektty/pull/56) | feat(tui): wrap leftover chrome and startup copy with ui() | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#57](https://github.com/Hilbert-beinghappy/seektty/pull/57) | feat(tui): wrap leftover host marketplace and settings copy with ui() | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#58](https://github.com/Hilbert-beinghappy/seektty/pull/58) | feat(tui): wrap leftover theme validation copy with ui() | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#59](https://github.com/Hilbert-beinghappy/seektty/pull/59) | feat(tui): wrap leftover surface chrome and notices with ui() | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#60](https://github.com/Hilbert-beinghappy/seektty/pull/60) | feat(tui): wrap leftover capability catalog and errors with ui() | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#61](https://github.com/Hilbert-beinghappy/seektty/pull/61) | feat(tui): wrap leftover transcript titles and empty copy with ui() | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#62](https://github.com/Hilbert-beinghappy/seektty/pull/62) | feat(tui): wrap leftover actions copy with ui() | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#63](https://github.com/Hilbert-beinghappy/seektty/pull/63) | feat(tui): keep error-advice timeout matching on a zh key | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#64](https://github.com/Hilbert-beinghappy/seektty/pull/64) | feat(tui): author protocol conflict copy without importing locale | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#65](https://github.com/Hilbert-beinghappy/seektty/pull/65) | test(tui): assert English chrome, help, and launcher copy stay hanzi-free | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#66](https://github.com/Hilbert-beinghappy/seektty/pull/66) | fix(tui): redact installer streams with a tail-hold buffer | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#67](https://github.com/Hilbert-beinghappy/seektty/pull/67) | fix(tui): persist composer history through Settings revision | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#68](https://github.com/Hilbert-beinghappy/seektty/pull/68) | fix(tui): hide queue reorder until Host has an atomic move | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#69](https://github.com/Hilbert-beinghappy/seektty/pull/69) | fix(tui): stop auto-allowing tools by name in the client | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#70](https://github.com/Hilbert-beinghappy/seektty/pull/70) | fix(tui): redact catalog URLs and address sources by rowKey | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#71](https://github.com/Hilbert-beinghappy/seektty/pull/71) | fix(tui): keep EOF newlines in a linear-space line diff | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#72](https://github.com/Hilbert-beinghappy/seektty/pull/72) | fix(tui): keep nested overlay Escape from aborting the session | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#73](https://github.com/Hilbert-beinghappy/seektty/pull/73) | fix(tui): do not cache marketplace search as a failure on abort | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#74](https://github.com/Hilbert-beinghappy/seektty/pull/74) | fix(tui): match startup timeouts on a stable 超时 mark | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#75](https://github.com/Hilbert-beinghappy/seektty/pull/75) | fix(tui): keep Settings conflict errors language-agnostic | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#76](https://github.com/Hilbert-beinghappy/seektty/pull/76) | fix(tui): keep Settings descriptions and pnpm PATH warnings bilingual | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#77](https://github.com/Hilbert-beinghappy/seektty/pull/77) | fix(tui): localize built-in theme names at display time | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#78](https://github.com/Hilbert-beinghappy/seektty/pull/78) | fix(tui): keep Host command descriptions and locale-keyed catalog cache | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#79](https://github.com/Hilbert-beinghappy/seektty/pull/79) | fix(tui): re-localize the default empty-session prompt | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#80](https://github.com/Hilbert-beinghappy/seektty/pull/80) | fix(tui): confirm removing the plugin from the Profile | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#81](https://github.com/Hilbert-beinghappy/seektty/pull/81) | fix(tui): bind the i18n AST gate to real ui imports | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#82](https://github.com/Hilbert-beinghappy/seektty/pull/82) | fix(tui): gate English chrome after a language switch | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#83](https://github.com/Hilbert-beinghappy/seektty/pull/83) | fix(tui): freeze ENGLISH_PATTERNS[0] as the applies-immediately rule | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#84](https://github.com/Hilbert-beinghappy/seektty/pull/84) | fix(tui): drop a stale restart ticket before spawning the child | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#85](https://github.com/Hilbert-beinghappy/seektty/pull/85) | fix(tui): restore cooked mode before async Surface teardown | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#86](https://github.com/Hilbert-beinghappy/seektty/pull/86) | fix(tui): apply the whole live behavior object from Settings | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#87](https://github.com/Hilbert-beinghappy/seektty/pull/87) | fix(tui): isolate elapsed, notify, and title by session | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#88](https://github.com/Hilbert-beinghappy/seektty/pull/88) | fix(tui): reject dsh newer than the tested compatibility range | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#89](https://github.com/Hilbert-beinghappy/seektty/pull/89) | fix(tui): bound clipboard fallback with an async deadline | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#90](https://github.com/Hilbert-beinghappy/seektty/pull/90) | fix(tui): highlight search hits with a once-built Set | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#91](https://github.com/Hilbert-beinghappy/seektty/pull/91) | fix(tui): refresh overlay lists without resetting query or selection | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#92](https://github.com/Hilbert-beinghappy/seektty/pull/92) | fix(tui): submit multiline overlays only on Ctrl+Enter | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#93](https://github.com/Hilbert-beinghappy/seektty/pull/93) | fix(tui): keep clipboard images in a private temp dir | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#94](https://github.com/Hilbert-beinghappy/seektty/pull/94) | fix(tui): export Markdown from the Host session log | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#95](https://github.com/Hilbert-beinghappy/seektty/pull/95) | fix(tui): list produced files from the Host session index | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#96](https://github.com/Hilbert-beinghappy/seektty/pull/96) | fix(tui): keep the selected empty-session example visible | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#97](https://github.com/Hilbert-beinghappy/seektty/pull/97) | fix(tui): keep tool-card arrows behind an explicit focus mode | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#98](https://github.com/Hilbert-beinghappy/seektty/pull/98) | fix(tui): label Settings fields only by namespace and path | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#99](https://github.com/Hilbert-beinghappy/seektty/pull/99) | fix(tui): validate the full keymap before write and apply | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#100](https://github.com/Hilbert-beinghappy/seektty/pull/100) | fix(tui): resolve theme export paths against the workspace | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#101](https://github.com/Hilbert-beinghappy/seektty/pull/101) | fix(tui): apply the latest theme before Shiki takes over | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#102](https://github.com/Hilbert-beinghappy/seektty/pull/102) | fix(tui): bind marketplace, Settings, and plugin caches to source fingerprints | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#103](https://github.com/Hilbert-beinghappy/seektty/pull/103) | fix(tui): include deliverables in the transcript node fingerprint | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#104](https://github.com/Hilbert-beinghappy/seektty/pull/104) | fix(tui): report answered and skipped questions separately | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#105](https://github.com/Hilbert-beinghappy/seektty/pull/105) | fix(tui): copy assistant replies without trimming edges | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#106](https://github.com/Hilbert-beinghappy/seektty/pull/106) | fix(tui): highlight search hits without stripping line styles | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#107](https://github.com/Hilbert-beinghappy/seektty/pull/107) | fix(tui): ignore a trailing newline when folding tool output | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#108](https://github.com/Hilbert-beinghappy/seektty/pull/108) | fix(tui): reject trajectory timestamps outside the Date range | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#109](https://github.com/Hilbert-beinghappy/seektty/pull/109) | fix(tui): keep restart handoffs in a private temp subdirectory | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#110](https://github.com/Hilbert-beinghappy/seektty/pull/110) | fix(tui): warn once per unknown fiber state per connection | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#111](https://github.com/Hilbert-beinghappy/seektty/pull/111) | fix(tui): parse launcher args with the launch environment | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#112](https://github.com/Hilbert-beinghappy/seektty/pull/112) | fix(tui): correct English spacing and Close labels | Consolidated/adapted in #114 → #115; v1.0.0 |
| [#113](https://github.com/Hilbert-beinghappy/seektty/pull/113) | chore(tui): rebuild lib from the completed review-fix stack | Consolidated/adapted in #114 → #115; v1.0.0 |

## Other closed PRs / 其他已关闭 PR

These records have no individual GitHub merge and are not counted as newly released features.

| PR | Title | Disposition |
| --- | --- | --- |
| [#136](https://github.com/Hilbert-beinghappy/seektty/pull/136) | DO NOT MERGE: UX integration preview | Closed without an individual merge; not credited as a new feature |
| [#138](https://github.com/Hilbert-beinghappy/seektty/pull/138) | feat(compat): adapt SeekTTY 1.1.0 to official dsh 0.1.0-rc.7 | Closed without an individual merge; not credited as a new feature |
| [#171](https://github.com/Hilbert-beinghappy/seektty/pull/171) | feat(queue): prioritize queued messages after interrupt | Closed without an individual merge; not credited as a new feature |

## Source releases

- [v1.0.0](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.0.0): Initial terminal baseline, bilingual/Windows launcher, onboarding, approvals and package gates.
- [v1.0.1](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.0.1): host.describe placeholder; grouped approval/status/overlay/Ctrl+C/question/catalog follow-ups.
- [v1.0.2](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.0.2): dsh rc.8, launcher/attachment/prompt-error handling; no individual replay/reasoning fix description.
- [v1.1.0](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.1.0): Optional Clarify terminal shell and capability detection.
- [v1.2.0](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.0): Dynamic review-first Clarify, usage provenance, Host identity and stale-response protection.
- [v1.2.1](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.1): Official dsh 0.1.1-rc.2 adaptation and retained Clarify/attachment flows.
- [v1.2.2](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.2): Long-session rendering, viewport bounds and display residue fixes.
- [v1.2.3](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.3): Application mouse/selection/scrollbar/clipboard interaction.
- [v1.2.4](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.4): User-message rules, navigation/selection/input fixes, release preparation.
- [v1.2.5](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.5): Welcome, background, TextMate, Thinking, permission/click fixes and npm publication.
- [v1.2.6](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.6): dsh 0.1.5-rc.1 API migration; existing flows are named broadly, without individual feature/fix details.

The historical source/branch map and raw API snapshot used for this audit remain local release evidence. This document contains no account credentials, personal paths, Session data, or raw runtime logs.
