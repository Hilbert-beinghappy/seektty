#!/usr/bin/env node

/**
 * Opt-in Clarify × SeekTTY doctor receiver check.
 *
 * What this automates:
 *   Isolated DSH_HOME + unchanged ProfilePluginManager.run(['add', CLARIFY_SPEC])
 *   + unchanged ProfilePluginManager.doctor(). Asserts zero error/warning and a
 *   healthy dsh-plugin-clarify bundle. This is not a stock CLI /doctor and does
 *   not rewrite SeekTTY doctor.
 *
 * What this cannot prove:
 *   doctor() does not inspect fibers. Fiber health needs a running Host and the
 *   existing TUI /doctor path (managementBridge().plugins.doctor() plus
 *   pluginInventory()). Do not treat this script as that acceptance.
 *
 * Manual fiber / official-boot plan for Codex:
 *   1. Build or pack the sibling Clarify package (it must have lib/ and
 *      dsh.bundle.patch). Example:
 *        (cd /path/to/dsh-plugin-clarify && pnpm pack)
 *   2. Isolated home, empty tui Profile (do not let a template inject missing
 *      bundles such as @deepseek-ai/dsh-base, or doctor() will error):
 *        CLARIFY_ACCEPT_HOME=$(mktemp -d)
 *        mkdir -p "$CLARIFY_ACCEPT_HOME/profiles/tui"
 *        printf '%s\n' '{"name":"dsh-profile-tui","private":true,"dependencies":{},"dsh":{"profile":{"bundles":[]}}}' \
 *          > "$CLARIFY_ACCEPT_HOME/profiles/tui/package.json"
 *   3. Official add + boot (requires DSH_BIN, not this repo's deepseek):
 *        DSH_HOME="$CLARIFY_ACCEPT_HOME" "$DSH_BIN" plugin --profile tui add /path/to/dsh-plugin-clarify
 *        DSH_HOME="$CLARIFY_ACCEPT_HOME" "$DSH_BIN" --profile tui --dump-config
 *      dump-config must mention dsh-plugin-clarify / id: clarify.
 *   4. Start unmodified SeekTTY against the same DSH_HOME / Profile and run
 *      local /doctor. Require zero error, zero warning, Clarify bundle active,
 *      and the clarify fiber not failed (pluginInventory fiberPhase).
 *   5. Do not invent a stock HTTP/CLI /doctor. Do not stage AppleDouble files.
 *
 * Usage:
 *   CLARIFY_SPEC=/path/to/dsh-plugin-clarify pnpm test:clarify-doctor
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const spec = process.env.CLARIFY_SPEC?.trim()
if (!spec) {
  process.stderr.write(`用法：CLARIFY_SPEC=/path/to/dsh-plugin-clarify pnpm test:clarify-doctor

此脚本只跑未改动的 ProfilePluginManager.doctor() 接收端（真包装入隔离 DSH_HOME）。
fiber 健康需要运行中的 SeekTTY /doctor + pluginInventory，见本文件顶部手跑步骤。
常规 pnpm test 里的 planted 用例只验证接收端，不冒充已安装真包。
`)
  process.exit(2)
}

const result = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/clarify-doctor-acceptance.test.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      CLARIFY_SPEC: resolve(spec),
    },
  },
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
