import { mkdtemp, writeFile, readdir, stat, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { validatePcm16Wave, withTemporaryWave } from '../src/client/wav-input.ts'
import { waveFixture } from './fixtures/wav-speech-official.js'

describe('bounded canonical WAV intake', () => {
  let root, path
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'seektty-wave-validation-')); path = join(root, 'selected.wav'); await writeFile(path, waveFixture()) })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })
  it('accepts 16kHz mono PCM16 and the exact duration boundary', () => {
    expect(validatePcm16Wave(waveFixture(16000), 1)).toBe(1)
    expect(() => validatePcm16Wave(waveFixture(16001), 1)).toThrow('duration budget')
  })
  it.each([[20, 2, 3], [22, 2, 2], [24, 4, 48000], [28, 4, 96000], [32, 2, 4], [34, 2, 32], [4, 4, 1], [40, 4, 1], [16, 4, 18]])('rejects incompatible or inconsistent header at offset %s', (offset, size, value) => {
    const wave = waveFixture()
    if (size === 2) wave.writeUInt16LE(value, offset); else wave.writeUInt32LE(value, offset)
    expect(() => validatePcm16Wave(wave, 120)).toThrow('canonical')
  })
  it('rejects non-WAV/empty/odd samples and invalid or excessive byte budgets', async () => {
    expect(() => validatePcm16Wave(waveFixture(0), 120)).toThrow('canonical')
    expect(() => validatePcm16Wave(Buffer.concat([waveFixture(), Buffer.from([0])]), 120)).toThrow('canonical')
    await expect(withTemporaryWave(path, 4 * 1024 * 1024 + 1, 120, new AbortController().signal, async () => {}, root)).rejects.toThrow('byte budget')
    await expect(withTemporaryWave(path, 50, 120, new AbortController().signal, async () => {}, root)).rejects.toThrow('within the byte budget')
    await expect(withTemporaryWave(root, 4096, 120, new AbortController().signal, async () => {}, root)).rejects.toThrow('regular file')
  })
  it('makes a private immutable copy, removes only its directory on failure and retains the selected file', async () => {
    await expect(withTemporaryWave(path, 4096, 120, new AbortController().signal, async (audio, seconds, copy) => {
      expect(seconds).toBe(0.1); expect(audio).toEqual(waveFixture())
      expect(await readFile(copy)).toEqual(audio)
      expect((await stat(copy)).mode & 0o777).toBe(0o600)
      expect((await stat(join(copy, '..'))).mode & 0o777).toBe(0o700)
      throw new Error('inert inference refused')
    }, root)).rejects.toThrow('inference refused')
    expect(await readdir(root)).toEqual(['selected.wav'])
  })
  it('does no file work after pre-abort', async () => {
    const abort = new AbortController(); abort.abort(new Error('user cancelled'))
    await expect(withTemporaryWave('/not/a/fixture', 4096, 120, abort.signal, async () => {}, root)).rejects.toThrow('user cancelled')
    expect(await readdir(root)).toEqual(['selected.wav'])
  })
})
