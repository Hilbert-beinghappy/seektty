# Optional Creator, BrowserUse and ComputerUse compositions

The default SeekTTY bundle still selects `standard`. The package also carries
six **private, explicitly installed companion bundles** under `optional/`.
They use published official `0.2.0-rc.2` packages; none are activated by the
default bundle, and none are published separately by this work.

Install SeekTTY into the target Profile first. Resolve its installed package
directory from that Profile, then pass the companion directory as a local
package to the existing native plugin manager. For example, with
`SEEKTTY_PACKAGE_DIR` set to that verified directory:

```sh
dsh plugin --profile tui add --config.enable-global-virtual-store=false "$SEEKTTY_PACKAGE_DIR/optional/creator"
```

The same absolute directory can be selected by the native install path in
`/plugins`. Native PluginManager owns dependency installation, persistent
Profile selection, peer compatibility, build approval and the reported
reload/restart requirement. Do not manually edit its lockfile or bypass an
install failure. These directories carry their own `package.json` and bundle
patch; top-level `optional/*.patch.yml` are the identical source overlays for
advanced explicit `--patch` composition when dependencies already exist.

| Companion directory | Official capability and required choice |
| --- | --- |
| `creator` | Complete official `cordis` Agent preset, package-owned skills and one process-wide Host inspect-provider row. Select Creator through `/mode` for a blank Session. |
| `browser-playwright-mcp` | Experimental Playwright MCP; launches isolated headless Chromium per newly created/resumed live Agent. The user supplies upstream browser installation. |
| `browser-chrome-devtools-mcp` | Experimental Chrome DevTools MCP; same explicit launch choice and future-Agent lifecycle. |
| `browser-stagehand-native` | Experimental SDK; requires explicit `SEEKTTY_STAGEHAND_MODEL` and `SEEKTTY_STAGEHAND_API_KEY`. No fallback to the Session route. SDK model inference is separate and can cost money. |
| `computer-cua-mcp` | Experimental installed `cua-driver mcp`; the separate installed driver owns OS setup and permissions. |
| `computer-cua-native` | Experimental native SDK; same-process native code and launching application's desktop permissions. Optional npm platform dependencies must remain enabled. |

Select **one** BrowserUse and **one** ComputerUse provider. Their official
registries reject conflicting reservations; there is no invented provider-
selection Remote. Profile composition selects the backend. The supplied
browser patches choose `launch`, not an existing logged-in browser. An explicit
user-authored `attach` composition requires the official `mode: attach` and
endpoint fields and keeps upstream exact-Agent exclusive ownership. Loading
or reloading a browser provider does not adopt already-active Agents.

Creator exposes official `cordis_inspect_list/query` read-only tools and
`plugin_manager`. Host inspectors are installed once outside Agent preset
trees. Browser-only Client inspection still requires a responding Web page;
terminal extension discovery is the separate explicit `seekttyExtensions`
service. Standard/PTC management rows remain disabled. Every Creator management
operation, including list, requires current full-access policy or one-shot
approval; approval does not widen the Session's persistent policy. Profile
changes affect its other Sessions. Build-script permissions and exact-version
exemptions retain their native confirmation requirements. Creator has no old
`define/run/stop` bridge and does not implement a second Agent loop.

Provider model tools, MCP resources, errors and image results travel through
the existing official ToolRuntime and terminal transcript. Only a route that
explicitly declares image input can receive durable screenshots. Unknown or
non-image routes retain the official diagnostic and canonical result; inline
bytes do not enter the displayed transcript. Cancelling a call cannot undo a
browser/desktop action already delivered. ComputerUse shares the host desktop;
it is not Session-isolated. Failed cleanup can retain a provider reservation,
and native SDK crashes can terminate the Host.

## Evidence and boundaries

`creator-host.test.js` uses unmodified official Cordis, Loader/Include,
ToolRuntime, SessionStore, ApprovalService, inspect services/tools and native
PluginManager on a disposable synthetic Profile. It verifies the parsed
Creator graph, package-owned skill directory, scoped tool visibility,
read-only inspection, no mutation on rejected list/install, native persisted
disable with `restart-required`, and a fresh Loader reading that saved patch.
It performs no model request, package installation or build script.

`optional-provider-host.test.js` uses the unmodified official Cua MCP provider,
Browser MCP Session runtime, registries, MCP client and ToolRuntime with a
synthetic child MCP executable. It verifies policy/cancellation zero dispatch,
two Agent-owned browser connections, error projection, no-image diagnostics,
actual durable local image storage on a positively admitted synthetic route,
and unload cleanup. It **does not launch or attach Playwright/Chrome/Stagehand,
initialize the native Cua SDK, request OS grants, capture a real desktop or
operate real accounts**. The browser fixture exercises the published shared
runtime, not those third-party engines.

Tests require explicit `SEEKTTY_OFFICIAL_NODE_MODULES` and
`SEEKTTY_OPTIONAL_NODE_MODULES` fixture paths. The latter must share the same
official Host dependency identities; four supplemental published packages were
SHA512-verified before these runs. `optional-compositions.test.ts` verifies
bundle source equality, exact package versions and that default boot cannot
activate any optional backend. Native companion installation and assembled
package PTY verification remain separate acceptance gates.

The reproducible read-only fixture materializer is
`scripts/prepare-optional-provider-fixture.mjs <verified-stock-node_modules>
<new-isolated-output-dir>`. It downloads only four exact official rc.2 artifacts
from npm, verifies SHA512, rejects unsafe archive members, records integrity
receipts and links the existing stock dependencies. It installs no SDK/browser,
runs no package scripts and refuses to overwrite an existing output directory.

This stage passed **6 files / 42 tests**, including the localized public approval
entry and D's ANSI concealment fix, and strict Node 24 typecheck. The Creator
fixture initially omitted an open turn and proper Cordis injections; corrected
fixtures use an actual Session turn and ordinary injected plugin mounts. A
copied synthetic PNG was malformed and correctly rejected; a codec-generated
1×1 image now exercises the successful durable path. These corrected runs do
not erase the earlier failed attempts. Logs are `/tmp/seektty-e-optional-composition.log`
and `/tmp/seektty-e-optional-typecheck.log`.
