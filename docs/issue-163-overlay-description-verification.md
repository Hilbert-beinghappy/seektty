# Overlay description width — issue #163

Verified on 2026-08-29 (Asia/Shanghai). Branch: `codex/fix-overlay-description-width`, based on `upstream/main` at `8b41904`. This fix is independent of the pending background PRs #162 and #164.

Issue: [Overlay descriptions truncate despite available space](https://github.com/Hilbert-beinghappy/seektty/issues/163).

## Cause and fix

Both single-select and multi-select overlays truncated descriptions before handing them to pi-tui: `Math.min(60, width - 36)`. Expanding the overlay could not recover the lost suffix. The fixed 32-cell primary column also wasted space for short labels.

- Preserve the complete, translated, terminal-sanitized description in each `SelectItem`, including a single-select row's disabled reason.
- Use the existing `SelectList` layout options to size the primary column from the widest filtered label, up to its previous 32-cell cap. Alignment stays consistent across scroll windows. Prefix, gap, ANSI/Unicode cell widths and the remaining description budget are calculated by the native renderer, not duplicated in the overlay.
- Extend the existing pinned `@mariozechner/pi-tui@0.73.1` patch with an optional `descriptionEllipsis`. Overlays request `…` at the final description truncation; other consumers retain their existing default. No new dependency or renderer is introduced.
- Remove description-width bookkeeping and list reconstruction during resize. The same list retains its query, selection and wheel offset. Multi-select checks, mouse arming, hover, row heights, footer actions and hit testing retain their existing behavior.

Rows remain single-line. Overlong descriptions still show an ellipsis when there is insufficient space; widening the overlay reveals the full source. The existing extremely narrow title-only fallback remains: pi-tui omits descriptions at content widths of 40 cells or less, or when its minimum description budget is unavailable. This fix does not add wrapping or a new detail-view interaction.

Only this package's bundled pi-tui is patched. Official dsh is unmodified, native `dsh plugin` reconciliation is preserved, and the declared Host compatibility range remains `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2` (this acceptance used `0.1.1-rc.2`). No user Profile, terminal settings, personal theme, or #161 taskbook was changed.

## Automated and packaged verification

The initial 16-test regression suite reproduced 12 failures on the old code, including descriptions cut at 60 cells in a 240-cell overlay. The final suite includes 20 description-layout tests and two additional pointer/frame integration cases.

| Layer | Result | Coverage / limits |
| --- | --- | --- |
| `pnpm run check` | Passed: 110 test files, 914 passed, 1 unrelated conditional skip | Typecheck, full tests, build and package checks. The conditional Clarify integration test is unrelated. |
| Description layout regressions | 20 passed | Single/multi-select, widths 40/50/60/79/80/180/240, exact-fit boundaries, long/short titles, disabled reasons, multiline normalization, CJK, emoji, combining characters, ANSI-styled descriptions, built-in and generated custom themes. |
| Pointer/frame integration | 14 passed, including 2 new cases | Real pi-tui frames with synthetic SGR wheel/click/hover events, resizing, footer activation and no search-input leakage. Not a real GUI terminal. |
| Official dsh `0.1.1-rc.2` | Passed | Candidate install, full boot to the non-interactive boundary, remove, reinstall, second boot, packed launcher and Host module identity in isolated `DSH_HOME` directories. |
| Windows ConPTY mouse harness | Passed: 1 cycle, 9,585 captured characters, exit 0 | Packaged interactive boot, mouse/context-menu gestures, resize and exit. This existing smoke test does not visually inspect `/mode` descriptions. |
| Package and diff | Passed | 23 allowlisted package entries; candidate `lib/index.js` matches the final build; `git diff --check` clean. No consumer `workspace:` dependencies. |

Environment: Windows, Node `26.1.0`, pnpm `11.7.0`, pi-tui `0.73.1`, node-pty `1.1.0`. The local candidate retains version `1.2.4`; this is not a release.

Candidate SHA-256:

```text
33cfc3a9d74be40a25ec3d53521bdebb30847a3aa8e89b89201181e8423026b9
```

## Real-terminal acceptance — pending

- Windows Terminal: no new manual visual verification recorded for this fix. ConPTY results above are not equivalent to viewing the terminal window.
- macOS and Linux: no devices available; untested.
- Manual checklist: open `/mode` in a wide terminal; verify complete descriptions when they fit; resize narrower/wider; search and scroll to later options; confirm the query, selected arrow, checked rows and scroll window persist; test click, hover, wheel, arrow keys, Enter and the Back button in both selector types.

## 中文结论

根因是单选与多选弹窗在渲染前把描述固定截到最多 60 列，以及短标题仍占满 32 列。现已保留完整描述，让原生列表按实际标题宽度分配空间，在最终渲染边界才添加省略号。resize 不再重建列表，不引入多行布局，也不改鼠标命中系统。极窄窗口沿用原来的仅标题显示方式。

914 项测试通过、1 项无关条件跳过；构建、打包、官方 dsh 隔离安装／启动／移除／重装及 Windows ConPTY 检查通过。新增测试覆盖中英文、emoji、组合字符、自定义主题、ANSI、宽窄窗口、搜索、选中与滚动状态及鼠标事件。三端实机视觉验收仍待人工确认，不把合成帧或 ConPTY 结果记作实机通过。
