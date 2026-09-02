# Provider configuration acceptance — Issue #187

Date: 2026-09-02

## Scope and environment

- Branch: `codex/issue-187-taskbook-fix`
- Base revision: `c0d620909d3500421df6f147f30a5c563daffbb6`
- Host: macOS Darwin 25.6.0 arm64
- Node.js: 24.20.0
- pnpm: 11.7.0
- Official dsh: 0.1.1-rc.2
- Candidate: `seektty-1.2.5.tgz`
- Candidate SHA-256: `2887711b22ba01de6b59b3dbe642ae5f92b8675b3c52ca336760438f0bb42642`

The candidate was built and exercised from an isolated worktree and temporary `HOME`/`DSH_HOME`. No credential value is recorded in this document, repository files, Settings, command output, or screenshots.

## Automated verification

| Check | Observed result |
| --- | --- |
| `pnpm run check` | Passed: typecheck, 139 test files, 1251 tests passed, 1 existing skipped test, build, and 25-entry package check |
| Provider-focused tests | Passed: schema join, model normalization/discovery, lossless full-model edits, endpoint/key Ref rotation, Credential describe fail-closed behavior, authoritative current-route deletion guards, deletion reread/verification, onboarding and event invalidation |
| `env -i PATH=<node-and-system-path> TMPDIR=/tmp DSH_BIN=<official-package>/lib/bin.js SEEKTTY_SPEC=<candidate> pnpm run test:stock` | Final post-review candidate passed against unmodified official dsh 0.1.1-rc.2: credential-free isolated install, full boot boundary, remove, reinstall, module identity, launcher, Profile and Bundle reconciliation. Earlier rc.6–rc.8 stock results remain historical evidence for the pre-review candidate. |

Vite printed non-failing warnings for missing source maps in the vendored client runtime. No test or build failed because of them.

## Real OpenCode API checks

The first line of `/Volumes/huawei/项目实战/opencode.md` was loaded directly into a temporary environment variable without echoing it. The documented OpenCode Go base URL and endpoints were then called from the command line.

| Protocol / endpoint | Model | Observed result |
| --- | --- | --- |
| Model discovery (`/models`) | Directory | 33 models returned |
| OpenAI Chat Completions (`/chat/completions`) | `deepseek-v4-flash` | Response received |
| OpenAI Chat Completions (`/chat/completions`) | `glm-5.3-flash` | Response received |
| OpenAI Chat Completions (`/chat/completions`) | `minimax-m2.5` | Response received |
| Anthropic Messages (`/messages`) | `minimax-m2.5` | Response received |
| OpenAI Responses (`/responses`) | `gpt-5.6-luna` | Response received with `max_output_tokens=32` |

The Responses request first returned HTTP 400 with `max_output_tokens=8`; repeating it with 32 succeeded. This is recorded as an external API parameter constraint, not hidden as a passing first attempt.

## Official dsh interactive acceptance

A fresh official dsh 0.1.1-rc.2 Profile installed the candidate and launched SeekTTY in a real pseudo-terminal.

1. First-run setup opened the shared Provider manager.
2. The official catalog displayed 39 Providers before the custom entry was created.
3. A custom `opencode-go-e2e` Provider was configured with the documented base URL.
4. The installed schema exposed `openai-completions`, `openai-responses`, and `anthropic-messages`; `openai-completions` was selected for this end-to-end route.
5. The credential reference `OPENCODE_GO_E2E_API_KEY` was detected by `credentials.describe` as externally managed/read-only. SeekTTY did not prompt for or write the secret.
6. `llm.discoverModels` returned 33 models. Only `deepseek-v4-flash` was selected and saved.
7. The first-run flow explicitly opened the current Session model selector. The custom route was selected rather than being changed implicitly by the save.
8. `/model` showed `deepseek-v4-flash` as current under `OpenCode Go E2E`.
9. A real prompt asking for the exact marker returned `SEEKTTY187_OK` through `opencode-go-e2e/deepseek-v4-flash` during configuration acceptance.
10. The persisted Settings document contained only the Provider configuration and credential reference; a scan found zero matches for the credential value.
11. After a clean exit and restart with the same isolated `DSH_HOME`, onboarding did not reopen and the welcome surface retained `opencode-go-e2e/deepseek-v4-flash`.
12. SeekTTY was removed and the final candidate was reinstalled. The Settings SHA-256 was identical before removal, after removal, and after reinstall.
13. The reinstalled final candidate opened directly on `opencode-go-e2e/deepseek-v4-flash`; a second real prompt returned `SEEKTTY187_FINAL_OK`.

## Security and compatibility conclusions

- Secrets use Harness Credentials only. Settings stores a reference, not a value.
- External environment/file credentials remain read-only and are not overwritten. Credential metadata failure disables uncertain key updates.
- An endpoint and key change uses a different, confirmed-unconfigured writable Ref. The revision-protected Settings mutation switches the Ref and endpoint together before `credentials.set`, so the old key is never routed to the new endpoint.
- Provider Settings writes use Harness revisions and leaf operations. Credential failure can be retried without repeating a successful Settings mutation.
- Model edits preserve the complete official `llm-pi-ai` model object, including `input`, `reasoningEfforts`, and `compat`.
- Provider deletion is limited to user-owned custom profiles and is disabled unless both authoritative current-Session and default-route protection state are known. References and ownership are re-read after confirmation, and removal is verified. Credentials and historical Sessions are retained.
- Model discovery is an explicit action, supports cancellation, and does not imply authentication or inference success.
- The implementation has no client-side Provider cache. Official Provider/Settings/connection events invalidate the model directory.

## Boundaries

This acceptance establishes the three protocol shapes exposed by the installed `llm-pi-ai` schema and a real OpenCode Go route. It does not claim certification of every vendor-specific extension, OAuth flow, proprietary endpoint, or dsh version outside the package's declared range. The older rc.6–rc.8 releases passed the stock lifecycle and missing-capability unit paths; the interactive Provider flow was exercised on rc.2 only. The official dsh 0.1.1-rc.2 remote-event type does not expose a credential-update event; the implementation therefore keeps no credential cache and reads value-free credential metadata when the Provider manager opens.
