import { ensureContrast } from './theme-config.ts'

const DEFAULT_FG = '\u001B[39m'
const SGR = /\u001B\[([0-9;:]*)m/gu
let cachedBackground: string | undefined
const colors = new Map<string, string>()

function readableForeground(rgb: string | undefined, background: string | undefined): string {
  // Unknown terminal palettes (including indexed colors) must not be guessed.
  if (rgb === undefined || background === undefined) return DEFAULT_FG
  if (background !== cachedBackground) { colors.clear(); cachedBackground = background }
  const cached = colors.get(rgb)
  if (cached !== undefined) return cached
  const hex = ensureContrast(rgb, background, 4.5)
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
  const sequence = `\u001B[38;2;${channels.join(';')}m`
  if (colors.size >= 256) colors.clear()
  colors.set(rgb, sequence)
  return sequence
}

/**
 * Adapt already-styled canvas rows, including cached Markdown foregrounds.
 * Track explicit background islands so code, panels and selections retain their
 * original foregrounds. Only SGR is interpreted; all text and geometry survive.
 */
export function readableCanvas(text: string, background?: string): string {
  let explicitBackground = false
  let foreground = DEFAULT_FG
  let rgb: string | undefined
  return text.replace(SGR, (sequence: string, parameters: string) => {
    const fields = parameters === '' ? ['0'] : parameters.split(';')
    let changed = false
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index] ?? '0'
      const parts = field.split(':')
      const code = Number(parts[0])
      if (code === 0) {
        foreground = DEFAULT_FG; rgb = undefined; explicitBackground = false; changed = true
      } else if (code === 38 || code === 48 || code === 58) {
        const colon = parts.length > 1
        const mode = Number(colon ? parts[1] : fields[index + 1])
        const count = mode === 2 ? 3 : mode === 5 ? 1 : 0
        const values = colon ? parts.slice(-count) : fields.slice(index + 2, index + 2 + count)
        const colorFields = colon ? field : fields.slice(index, index + 2 + count).join(';')
        if (!colon) index += 1 + count
        if (code === 38) {
          foreground = `\u001B[${colorFields}m`
          rgb = mode === 2 && values.length === 3 && values.every(value => /^\d+$/u.test(value) && Number(value) <= 255)
            ? `#${values.map(value => Number(value).toString(16).padStart(2, '0')).join('')}` : undefined
          changed = true
        } else if (code === 48) { explicitBackground = true; changed = true }
      } else if (code === 39 || (code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
        foreground = `\u001B[${field}m`; rgb = undefined; changed = true
      } else if (code === 49 || (code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
        explicitBackground = code !== 49; changed = true
      }
    }
    return changed ? sequence + (explicitBackground ? foreground : readableForeground(rgb, background)) : sequence
  })
}
