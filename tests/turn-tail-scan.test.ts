import { expect, it } from 'vitest'
import { turnTailDefinition as actual } from '../vendor/ui-conversation/client/conversation-nodes/turn-tail.js'

const build = (definition: typeof actual, context: unknown) => definition.buildLocationData!(context as never, 'turn')

it('does not scan accumulated chunks to rediscover an absent turn/end', () => {
  for (const count of [100, 1000, 4000]) {
    let scanned = 0
    const matches = Array.from({ length: count }, (_, seq) => ({ event: { seq, type: 'assistant/chunk' } }))
    const find = matches.find.bind(matches)
    matches.find = ((predicate: Parameters<typeof matches.find>[0]) => find((item, index, list) => { scanned++; return predicate(item, index, list) })) as typeof matches.find
    const context = { state: { turn: 1 }, matches }
    for (let iteration = 0; iteration < 100; iteration++) expect(build(actual, context)).toBeNull()
    expect(scanned).toBe(0)
  }
})

it('retains end-state and missing-start history fallback outputs', () => {
  const turn = { steps: [] }
  const start = { event: { type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } }, location: { kind: 'turn', turn } }
  const end = { event: { type: 'turn/end', seq: 2, time: 2, data: { turn: 1, reason: { kind: 'completed' } } }, location: { kind: 'turn', turn } }
  const expected = { kind: 'turn', turn: 1, key: 'turn-tail', value: {
    turn: 1, seq: 2, time: 2, closing: null, branchUnavailable: true,
    statistics: { steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 },
  } }
  expect(build(actual, { start, matches: [start], state: { turn: 1 } })).toBeNull()
  expect(build(actual, { start, matches: [start, end], state: { turn: 1, end } })).toEqual(expected)
  expect(build(actual, { matches: [end], state: undefined })).toEqual(expected)
  expect(build(actual, { matches: [end], state: null })).toEqual(expected)
  expect(build(actual, { matches: [], state: undefined })).toBeNull()
})
