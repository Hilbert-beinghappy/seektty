#!/usr/bin/env node
// Packaged management journeys in a disposable Harness home. Real PTY input,
// native settings/Profile persistence, and loopback-only model responses.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import crossSpawn from 'cross-spawn'
import { spawn } from 'node-pty'
import xterm from '@xterm/headless'
import { load } from 'js-yaml'
import { verifyStockDsh } from './stock-dsh-version.mjs'

const { Terminal } = xterm
const repository = resolve(import.meta.dirname, '..')
export const fixtureSecret = 'management-fixture-not-a-real-key'

export async function managementAcceptance({ interactive = false } = {}) {
  const dsh = resolve(process.env.DSH_BIN ?? join(repository, '.artifacts/stock-dsh-0.1.5-rc.1/node_modules/.bin/dsh'))
  const candidate = resolve(process.env.SEEKTTY_SPEC ?? join(repository, '.artifacts/seektty-rc1-qa-20.tgz'))
  const stock = verifyStockDsh(dsh)
  const root = mkdtempSync(join(tmpdir(), 'seektty-management-acceptance-'))
  const home = join(root, 'dsh-home')
  const userHome = join(root, 'user-home')
  const workspace = join(root, 'workspace')
  for (const directory of [home, userHome, workspace]) mkdirSync(directory)
  const report = { root, home, workspace, candidate, candidateSha256: createHash('sha256').update(readFileSync(candidate)).digest('hex'),
    version: stock.version, mode: interactive ? 'supervised' : 'automated', startedAt: new Date().toISOString(), steps: [], requests: [] }
  const save = () => writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  const settings = () => existsSync(join(home, 'settings.yaml')) ? load(readFileSync(join(home, 'settings.yaml'), 'utf8')) ?? {} : {}
  const record = (name, extra = {}) => { report.steps.push({ name, status: 'passed', ...extra }); save(); console.log(JSON.stringify({ passed: name, ...extra })) }
  const env = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL', 'SystemRoot', 'ComSpec', 'PATHEXT']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
  Object.assign(env, { HOME: userHome, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', SEEKTTY_UPDATE: 'off',
    SEEKTTY_MANAGEMENT_OFFICIAL_KEY: 'fixture-official-only', TERM: 'xterm-256color', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' })
  const pnpmEntry = process.env.SEEKTTY_PNPM_ENTRY ?? process.env.npm_execpath
  assert(pnpmEntry && existsSync(pnpmEntry), 'Set SEEKTTY_PNPM_ENTRY to the installed pnpm CLI entry')
  const bin = join(root, 'bin'); mkdirSync(bin)
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`
  const pnpmShim = join(bin, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  writeFileSync(pnpmShim, process.platform === 'win32'
    ? `@"${process.execPath}" "${pnpmEntry}" %*\r\n`
    : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(pnpmEntry)} "$@"\n`)
  chmodSync(pnpmShim, 0o755)
  env.PATH = bin + (process.platform === 'win32' ? ';' : ':') + env.PATH
  let expectedFixtureSecret = fixtureSecret
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      report.requests.push({ kind: 'discovery', credentialMatched: req.headers.authorization === `Bearer ${fixtureSecret}` }); save()
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'management-fixture-model', object: 'model', owned_by: 'fixture' }] })); return
    }
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) { res.writeHead(404); res.end(); return }
    let body = ''; for await (const chunk of req) body += chunk
    const data = JSON.parse(body)
    report.requests.push({ kind: 'inference', model: data.model, stream: data.stream === true,
      ...(data.model === 'management-fixture-model' ? { credentialMatched: req.headers.authorization === `Bearer ${expectedFixtureSecret}`, credentialVersion: expectedFixtureSecret === fixtureSecret ? 'original' : 'edited' } : {}) }); save()
    const content = data.tools?.length ? 'MANAGEMENT_MODEL_REPLY' : 'Management fixture'
    const completion = { id: 'management-fixture', object: 'chat.completion', created: 1, model: data.model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }
    if (!data.stream) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(completion)); return }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    for (const delta of [{ role: 'assistant' }, { content }, {}]) res.write('data: ' + JSON.stringify({ ...completion, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: Object.keys(delta).length ? null : 'stop' }] }) + '\n\n')
    res.end('data: [DONE]\n\n')
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`
  report.baseURL = baseURL
  writeFileSync(join(home, 'settings.yaml'), `locale:\n  preference: en\nllm-deepseek:\n  apiKeyEnv: SEEKTTY_MANAGEMENT_OFFICIAL_KEY\n  baseURL: ${baseURL}\n  retryPolicy:\n    mode: normal\n    maxRetries: 0\n`)
  const fixturePlugin = join(root, 'management-fixture-plugin')
  mkdirSync(fixturePlugin)
  writeFileSync(join(fixturePlugin, 'package.json'), JSON.stringify({ name: 'seektty-management-fixture', version: '0.0.1', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(fixturePlugin, 'cordis.patch.yml'), '[]\n')
  const themePath = join(workspace, 'management-theme.json')
  writeFileSync(themePath, JSON.stringify({ name: 'Management fixture theme', type: 'dark', colors: {
    'editor.background': '#101820', 'editor.foreground': '#f0f0f0', 'editorLineNumber.foreground': '#9eacba',
    'editorCursor.foreground': '#f0f0f0', 'editor.selectionBackground': '#31506e', 'focusBorder': '#85baff',
  }, tokenColors: [{ scope: 'keyword', settings: { foreground: '#90caff' } }] }))
  console.log(JSON.stringify({ evidenceDirectory: root, baseURL, fixturePlugin, themePath }))
  save()
  const install = crossSpawn.sync(dsh, ['plugin', '--profile', 'tui', 'add', '--config.enable-global-virtual-store=false', candidate], {
    cwd: workspace, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000,
  })
  writeFileSync(join(root, 'install.log'), `${install.stdout ?? ''}\n${install.stderr ?? ''}`)
  if (install.status !== 0) {
    report.status = 'failed'; report.failure = `Install failed: ${install.error ?? install.stderr}`; save()
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    throw new Error(report.failure)
  }
  record('isolated-native-install')
  let child, terminal, exited, writes = Promise.resolve(), cycle = 0
  let raw = ''
  const screen = () => {
    const buffer = terminal.buffer.active
    return Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) ?? '').join('\n')
  }
  const snapshot = name => { const path = join(root, `${cycle}-${name}.txt`); writeFileSync(path, screen()); return path }
  const wait = async (predicate, label, timeout = 25000) => {
    const until = Date.now() + timeout
    while (Date.now() < until) {
      await writes
      if (predicate()) return
      if (exited) throw new Error(`${label}: exited ${JSON.stringify(exited)}\n${screen()}`)
      await delay(50)
    }
    throw new Error(`${label}: timeout\n${screen()}`)
  }
  const open = async (profile = 'tui') => {
    cycle++; exited = undefined; raw = ''
    terminal = new Terminal({ cols: 140, rows: 44, allowProposedApi: true, scrollback: 3000 })
    child = spawn(process.execPath, [stock.entry, '--profile', profile], { cwd: workspace, cols: 140, rows: 44, name: 'xterm-256color', env })
    child.onData(chunk => { raw += chunk; appendFileSync(join(root, `${cycle}.raw`), chunk); writes = writes.then(() => new Promise(resolve => terminal.write(chunk, resolve))) })
    child.onExit(event => { exited = event })
    await wait(() => /Type a message|Enter a message/u.test(screen()), 'composer')
  }
  const key = async text => { child.write(text); await delay(180); await writes }
  const command = async text => { await key(text); await key('\r'); await delay(300); await writes }
  // Inputs with an initial value start at its beginning. Move to the end before
  // clearing; Ctrl+U alone would prepend fixture text to the existing value.
  const field = async text => { await key('\u0005\u0015' + text); await key('\r') }
  const choose = async text => { await field(text) }
  const close = async () => {
    await command('/exit')
    const until = Date.now() + 10000; while (!exited && Date.now() < until) await delay(50)
    assert.equal(exited?.exitCode, 0, 'clean PTY exit')
    assert.doesNotMatch(raw, /ZodError|Connection lost|Reconnecting|cannot get property .* without inject/u)
    terminal.dispose()
  }
  try {
    await open()
    record('packaged-management-boot', { screen: snapshot('boot') })
    if (interactive) {
      console.log(screen())
      const lines = createInterface({ input: process.stdin })
      for await (const line of lines) {
        try {
          const action = JSON.parse(line)
          if (action.command !== undefined) await command(action.command)
          if (action.key !== undefined) await key(action.key)
          if (action.field !== undefined) await field(action.field)
          if (action.choose !== undefined) await choose(action.choose)
          if (action.delay !== undefined) await delay(action.delay)
          if (action.snapshot !== undefined) console.log(snapshot(action.snapshot))
          if (action.settings === true) console.log(JSON.stringify(settings()))
          if (action.pass) record(action.pass, { screen: snapshot(action.pass) })
          if (action.open) { if (!exited) await close(); await open(action.open) }
          if (action.exit) { await close(); break }
          await writes; console.log(screen())
        } catch (error) { console.error(String(error.stack ?? error)) }
      }
      lines.close()
      process.stdin.pause()
    } else {
      const expectScreen = (pattern, label = String(pattern), timeout) => wait(() => pattern.test(screen()), label, timeout)
      const state = (predicate, label) => wait(() => predicate(settings()), label)
      const pass = name => record(name, { screen: snapshot(name) })
      const escape = () => key('\u001b')
      const confirm = async () => { await key('\u001b[B'); await key('\r') }
      const saveThemePreview = async () => {
        await key('\r')
        await wait(() => !/Theme Preview/u.test(screen()), 'theme preview submitted')
        if (/Theme has contrast warnings/u.test(screen())) {
          snapshot('theme-contrast-confirmation')
          await confirm()
        }
      }
      const profileManifest = profile => JSON.parse(readFileSync(join(home, 'profiles', profile, 'package.json'), 'utf8'))
      const credentials = () => load(readFileSync(join(home, '.credentials.yaml'), 'utf8'))
      const provider = value => value['llm-pi-ai']?.providers?.['management-fixture']
      const themeState = () => settings()['seektty-appearance'] ?? {}

      await command('/language zh')
      await state(value => value.locale?.preference === 'zh', 'Chinese language persisted')
      snapshot('language-zh')
      await command('/language en')
      await state(value => value.locale?.preference === 'en', 'English language persisted')
      await command('/settings locale')
      await expectScreen(/Choose interface language/u)
      await escape(); await escape()
      pass('01-settings-language-roundtrip')

      const welcomeDraft = async text => {
        await command('/welcome'); await expectScreen(/Custom information rows/u)
        await key('\u001b[B\r'); await expectScreen(/Add a row/u)
        await key('\r'); await expectScreen(/Heading/u)
        await key('\r'); await expectScreen(/Heading text/u)
        await field(text); await expectScreen(new RegExp(text))
      }
      await welcomeDraft('Cancelled management heading')
      snapshot('welcome-cancel-preview'); await escape(); await escape()
      assert.equal(settings()['seektty-welcome'], undefined)
      pass('02-settings-welcome-cancel')
      await welcomeDraft('Saved management heading')
      await escape(); await key('\u001b[B'.repeat(5) + '\r')
      await state(value => value['seektty-welcome']?.customRows?.some(row => row.text === 'Saved management heading'), 'welcome draft saved')
      pass('03-settings-welcome-save')

      await command('/theme light'); await state(value => value['seektty-appearance']?.theme === 'light', 'light theme saved')
      snapshot('theme-light'); await command('/theme dark')
      await state(value => value['seektty-appearance']?.theme === 'dark', 'dark theme saved')
      pass('04-theme-builtins-roundtrip')
      const beforeImport = JSON.stringify(themeState())
      await command(`/theme import ${themePath}`); await expectScreen(/Theme Preview.*Management fixture/u)
      snapshot('theme-cancel-preview'); await escape()
      assert.equal(JSON.stringify(themeState()), beforeImport)
      pass('05-theme-import-preview-cancel')
      await command(`/theme import ${themePath}`); await expectScreen(/Theme Preview.*Management fixture/u)
      await saveThemePreview()
      await state(value => value['seektty-appearance']?.theme === 'custom:management-fixture-theme', 'custom theme saved')
      assert.equal(themeState().codeTheme, 'custom:management-fixture-theme')
      pass('06-theme-import-save')
      const exported = join(workspace, 'exported-theme.json')
      await command(`/theme export management-fixture-theme ${exported}`)
      await wait(() => existsSync(exported), 'theme export created')
      const exportedBytes = readFileSync(exported, 'utf8')
      assert.equal(JSON.parse(exportedBytes).name, 'Management fixture theme')
      await command(`/theme export management-fixture-theme ${exported}`)
      await expectScreen(/File already exists/u)
      assert.equal(readFileSync(exported, 'utf8'), exportedBytes)
      pass('07-theme-export-preserves-existing-file')
      await command(`/theme import-url rejected ${baseURL}/theme.json`)
      await expectScreen(/require an HTTPS URL without credentials/u)
      // Error notices intentionally persist above later toasts until Esc.
      snapshot('theme-invalid-url-rejected'); await escape()
      const beforeDelete = themeState().customThemes.length
      await command('/theme delete management-fixture-theme'); await expectScreen(/Delete/u)
      await escape(); assert.equal(themeState().customThemes.length, beforeDelete)
      await command('/theme delete management-fixture-theme'); await expectScreen(/Delete/u)
      await confirm()
      await state(value => !value['seektty-appearance']?.customThemes?.some(theme => theme.id === 'management-fixture-theme'), 'custom theme removed')
      pass('08-theme-invalid-url-and-delete-confirmation')

      const remoteUrl = process.env.SEEKTTY_REMOTE_THEME_URL ?? 'https://raw.githubusercontent.com/microsoft/vscode/main/extensions/theme-defaults/themes/dark_modern.json'
      report.remoteThemeUrl = remoteUrl; save()
      await command(`/theme import-url management-remote ${remoteUrl}`)
      await expectScreen(/Theme Preview.*management-remote/u, 'public HTTPS theme preview', 30000)
      await saveThemePreview()
      await state(value => value['seektty-appearance']?.customThemes?.some(theme => theme.id === 'management-remote' && theme.remoteSource?.url === remoteUrl), 'remote source persisted')
      await command('/theme update management-remote')
      await expectScreen(/Theme Preview.*management-remote/u, 'HTTPS theme update preview', 30000)
      snapshot('theme-update-preview'); await saveThemePreview()
      await state(value => value['seektty-appearance']?.theme === 'custom:management-remote', 'updated theme applied')
      pass('09-theme-https-import-and-update')
      await escape()

      await command('/model'); await choose('Manage Providers'); await expectScreen(/Provider management/u)
      await choose('Add custom Provider'); await expectScreen(/Custom Provider ID/u)
      await field('management-fixture'); await expectScreen(/Display name \(optional\)/u)
      await field('Management Fixture'); await expectScreen(/Base URL/u)
      await field(baseURL); await expectScreen(/API protocol/u)
      await choose('openai-completions'); await expectScreen(/Credential Ref \(optional\)/u)
      await field('SEEKTTY_MANAGEMENT_FIXTURE_KEY'); await expectScreen(/Provider API key/u)
      await field(fixtureSecret); await expectScreen(/Provider models/u)
      await choose('Fetch available models'); await expectScreen(/Choose models to add/u)
      await key(' \r'); await expectScreen(/The draft contains 1 models/u)
      await choose('Finish model editing'); await expectScreen(/Create Management Fixture/u)
      await confirm(); await state(value => provider(value)?.models?.[0]?.id === 'management-fixture-model', 'custom provider persisted')
      await expectScreen(/Provider management/u)
      await expectScreen(/saved and verified through the official directories|save request returned, but final state|Settings and Credential were verified/u, 'provider create feedback')
      report.providerCreateNotice = screen().split('\n').at(-1)?.trim(); save()
      if (!/saved and verified through the official directories/u.test(report.providerCreateNotice)) {
        report.warnings = [{ step: '10-provider-create-discover-edit-route-delete', message: report.providerCreateNotice }]; save()
      }
      assert.match(report.providerCreateNotice, /saved and verified through the official directories/u, 'initial Provider creation must be verified by the native readback')
      assert.equal(provider(settings()).apiKeyEnv, 'SEEKTTY_MANAGEMENT_FIXTURE_KEY')
      assert(report.requests.some(request => request.kind === 'discovery' && request.credentialMatched))
      assert(credentials().refs.SEEKTTY_MANAGEMENT_FIXTURE_KEY)
      snapshot('provider-created')
      // Acknowledge any create warning before reading the Provider again.
      await escape(); await escape(); await escape()
      await command('/model'); await choose('Manage Providers')
      await choose('Management Fixture'); await choose('Display name')
      await field('Management Edited'); await choose('Save Provider')
      await state(value => provider(value)?.displayName === 'Management Edited', 'provider edit persisted')
      await expectScreen(/saved and verified through the official directories/u)
      // Existing-key rotation is a separate native Credentials transaction.
      await choose('Management Edited'); await choose('API key'); await expectScreen(/Provider API key/u)
      expectedFixtureSecret = fixtureSecret + '-edited'
      await field(expectedFixtureSecret); await choose('Save Provider')
      await expectScreen(/saved and verified through the official directories/u)
      await escape(); await choose('management-fixture-model'); await escape()
      await command('Management provider route fixture')
      await expectScreen(/MANAGEMENT_MODEL_REPLY/u, 'custom provider actual response')
      assert(report.requests.some(request => request.model === 'management-fixture-model' && request.credentialMatched && request.credentialVersion === 'edited'))
      snapshot('provider-model-reply')
      await command('/model'); await choose('DeepSeek-V4-Flash'); await escape()
      await command('/model'); await choose('Manage Providers'); await choose('Management Edited')
      await choose('Delete user Provider'); await expectScreen(/Delete Management Edited/u)
      await escape(); assert(provider(settings()))
      await choose('Delete user Provider'); await expectScreen(/Delete Management Edited/u)
      await confirm(); await state(value => provider(value) === undefined, 'provider deletion persisted')
      await expectScreen(/deletion was verified; credential retained/u)
      assert(credentials().refs.SEEKTTY_MANAGEMENT_FIXTURE_KEY)
      await escape(); await escape()
      pass('10-provider-create-discover-edit-route-delete')

      await command(`/plugin install ${fixturePlugin}`); await expectScreen(/Install seektty-management-fixture in tui/u)
      await confirm(); await expectScreen(/Restart required after Install seektty-management-fixture/u, 'plugin installed', 90000)
      assert(profileManifest('tui').dsh.profile.bundles.includes('seektty-management-fixture'))
      await escape(); await close(); await open()
      await command('/plugin list'); await expectScreen(/seektty-management-fixture/u)
      snapshot('plugin-installed-after-restart'); await escape()
      pass('11-plugin-install-and-restart')
      await command('/plugin remove seektty-management-fixture'); await expectScreen(/Remove/u)
      await escape(); assert(profileManifest('tui').dependencies['seektty-management-fixture'])
      await command('/plugin remove seektty-management-fixture'); await expectScreen(/Remove/u)
      await confirm(); await expectScreen(/Restart required after Remove seektty-management-fixture/u, 'plugin removed', 90000)
      assert(!profileManifest('tui').dependencies['seektty-management-fixture'])
      assert(!profileManifest('tui').dsh.profile.bundles.includes('seektty-management-fixture'))
      await escape(); await close(); await open()
      pass('12-plugin-remove-and-restart')

      await command('/profile create management-new')
      await expectScreen(/Switch to management-new now/u, 'new profile ready', 90000)
      assert.equal(profileManifest('management-new').dependencies.seektty, profileManifest('tui').dependencies.seektty)
      assert(existsSync(join(home, 'profiles/management-new/node_modules/seektty/cordis.patch.yml')))
      await escape(); await command('/profile list'); await expectScreen(/management-new.*Ready/u)
      await escape(); pass('13-profile-create-native-install')
      await command('/profile copy tui management-copy')
      await expectScreen(/Switch to management-copy now/u, 'copied profile ready', 90000)
      await escape(); await command('/profile switch management-copy')
      await expectScreen(/Switch.*management-copy/u); await confirm()
      await delay(1000); await expectScreen(/Enter a message/u)
      await command('/profile list'); await expectScreen(/● management-copy.*Ready/u)
      assert.equal(profileManifest('management-copy').dependencies.seektty, profileManifest('tui').dependencies.seektty)
      snapshot('profile-active-copy'); await escape()
      pass('14-profile-copy-and-controlled-switch')
      await close(); await open('management-copy')
      assert.equal(settings().locale.preference, 'en')
      assert(settings()['seektty-welcome'].customRows.some(row => row.text === 'Saved management heading'))
      assert.equal(themeState().theme, 'custom:management-remote')
      assert.equal(provider(settings()), undefined)
      await expectScreen(/Saved management heading/u)
      pass('15-settings-persist-after-profile-restart')
      await close()
      report.completedAt = new Date().toISOString(); report.journeyCount = 15
      report.status = report.warnings?.length ? 'passed-with-warnings' : 'passed'; save()
    }
  } catch (error) {
    report.status = 'failed'; report.failure = String(error.stack ?? error); if (terminal) report.failureScreen = snapshot('failure'); save(); throw error
  } finally {
    if (child && !exited) child.kill(); terminal?.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); save()
  }
  console.log(JSON.stringify({ report: join(root, 'report.json'), steps: report.steps.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await managementAcceptance({ interactive: process.argv.includes('--interactive') })
}
