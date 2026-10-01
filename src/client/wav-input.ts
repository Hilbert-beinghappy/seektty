/** Canonical WAV intake matched to dsh-experimental-speech-to-text 0.2.0-rc.2 validateWave. */
import { constants } from 'node:fs'
import { open, mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export function validatePcm16Wave(data: Buffer, maxDurationSeconds: number): number {
  if (data.length < 46 || data.toString('ascii', 0, 4) !== 'RIFF'
    || data.toString('ascii', 8, 12) !== 'WAVE' || data.toString('ascii', 12, 16) !== 'fmt '
    || data.readUInt32LE(16) !== 16 || data.readUInt16LE(20) !== 1 || data.readUInt16LE(22) !== 1
    || data.readUInt32LE(24) !== 16000 || data.readUInt32LE(28) !== 32000
    || data.readUInt16LE(32) !== 2 || data.readUInt16LE(34) !== 16
    || data.toString('ascii', 36, 40) !== 'data' || data.readUInt32LE(4) !== data.length - 8
    || data.readUInt32LE(40) !== data.length - 44 || (data.length - 44) % 2 !== 0) {
    throw new Error('Choose a canonical 16 kHz mono PCM16 WAV file; no conversion is performed')
  }
  const seconds = (data.length - 44) / 32000
  if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0 || seconds > maxDurationSeconds) throw new Error('WAV duration budget exceeded')
  return seconds
}

/** Snapshot only a selected regular file; cleanup owns only a newly-created private directory. */
export async function withTemporaryWave<T>(path: string, maxBytes: number, maxSeconds: number,
  signal: AbortSignal, use: (audio: Buffer, seconds: number, temporaryPath: string) => Promise<T>, temporaryRoot = tmpdir()): Promise<T> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 46 || maxBytes > 4 * 1024 * 1024) throw new Error('Invalid WAV byte budget')
  signal.throwIfAborted()
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  let data: Buffer
  try {
    signal.throwIfAborted()
    const before = await handle.stat()
    if (!before.isFile() || before.size < 46 || before.size > maxBytes) throw new Error('WAV must be a regular file within the byte budget')
    data = Buffer.alloc(before.size + 1)
    let bytes = 0
    while (bytes < data.length) {
      signal.throwIfAborted()
      const chunk = await handle.read(data, bytes, data.length - bytes, null)
      if (chunk.bytesRead === 0) break
      bytes += chunk.bytesRead
    }
    const after = await handle.stat()
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('WAV changed during selection')
    data = data.subarray(0, bytes)
  } finally { await handle.close() }
  signal.throwIfAborted()
  const seconds = validatePcm16Wave(data, maxSeconds)
  const directory = await mkdtemp(join(temporaryRoot, 'seektty-wav-'))
  try {
    signal.throwIfAborted()
    await chmod(directory, 0o700)
    const temporaryPath = join(directory, 'input.wav')
    await writeFile(temporaryPath, data, { flag: 'wx', mode: 0o600 })
    signal.throwIfAborted()
    return await use(data, seconds, temporaryPath)
  } finally { await rm(directory, { recursive: true, force: true }) }
}
