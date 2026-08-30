/** Keep printable text and color-only SGR while dropping active terminal commands. */

function safeSgr(parameters: string): string | undefined {
  const values = parameters === '' ? [0] : parameters.split(';').map(value => Number.parseInt(value, 10))
  if (values.some(value => !Number.isInteger(value) || value < 0)) return undefined
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === 38 || value === 48) {
      const mode = values[index + 1]
      if (mode === 5) {
        const palette = values[index + 2]
        if (palette === undefined || palette > 255) return undefined
        index += 2
        continue
      }
      if (mode === 2) {
        const channels = values.slice(index + 2, index + 5)
        if (channels.length !== 3 || channels.some(channel => channel > 255)) return undefined
        index += 4
        continue
      }
      return undefined
    }
    if (value === undefined || !(
      value === 0 || value === 1 || value === 2 || value === 22
      || value === 39 || value === 49
      || (value >= 30 && value <= 37)
      || (value >= 40 && value <= 47)
      || (value >= 90 && value <= 97)
      || (value >= 100 && value <= 107)
    )) return undefined
  }
  return `\u001B[${parameters}m`
}

/**
 * Sanitize untrusted terminal text without interpreting it. The result can
 * contain only printable Unicode, newlines, spaces, and validated SGR color or
 * intensity sequences.
 */
export function sanitizeColorAnsiText(source: string): string {
  let output = ''
  let index = 0
  while (index < source.length) {
    const code = source.charCodeAt(index)
    if (code === 0x0A) {
      output += '\n'
      index += 1
      continue
    }
    if (code === 0x0D) {
      output += '\n'
      index += source.charCodeAt(index + 1) === 0x0A ? 2 : 1
      continue
    }
    if (code === 0x09) {
      output += '  '
      index += 1
      continue
    }
    if (code === 0x1B) {
      const rest = source.slice(index)
      const sgr = /^\x1B\[([0-9;]*)m/u.exec(rest)
      if (sgr !== null) {
        output += safeSgr(sgr[1] ?? '') ?? ''
        index += sgr[0].length
        continue
      }
      const control = /^\x1B(?:\][^\x07]*(?:\x07|\x1B\\)|[P^_X][\s\S]*?\x1B\\|\[[0-?]*[ -\/]*[@-~]|[@-_])/u.exec(rest)
      index += control?.[0].length ?? 1
      continue
    }
    const point = source.codePointAt(index)
    if (point === undefined) break
    if ((point >= 0x20 && point !== 0x7F) || point > 0x9F) output += String.fromCodePoint(point)
    index += point > 0xFFFF ? 2 : 1
  }
  return output
}
