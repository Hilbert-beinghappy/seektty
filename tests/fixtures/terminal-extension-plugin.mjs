/** A real Loader consumer. No SeekTTY private imports or browser globals. */
export const name = 'terminal-extension-fixture'
export const inject = ['seekttyExtensions']
export function apply(ctx) {
  ctx.effect(() => ctx.seekttyExtensions.registerSessionAction({
    id: 'fixture.session', label: 'Fixture Session action', order: 5,
    async run(target) { return `Session target: ${target.sessionId}` },
  }))
  ctx.effect(() => ctx.seekttyExtensions.registerInputActivity({
    id: 'fixture.input', label: 'Fixture input activity',
    async run(target) { return `input:${target.selection.start}-${target.selection.end}` },
  }))
}
