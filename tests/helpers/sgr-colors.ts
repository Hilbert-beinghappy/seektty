/** Decode the effective RGB/indexed colors of generated SGR text, including resets. */
export function sgrCells(text: string) {
  let foreground: string | undefined
  let background: string | undefined
  const cells: { text: string; foreground: string | undefined; background: string | undefined }[] = []
  const chunks = text.split(/(\u001B\[[0-9;:]*m)/u)
  for (const chunk of chunks) {
    if (!chunk.startsWith('\u001B[')) {
      cells.push(...Array.from(chunk, text => ({ text, foreground, background })))
      continue
    }
    const values = chunk.slice(2, -1).split(/[;:]/u).map(Number)
    for (let i = 0; i < values.length; i++) {
      const code = values[i]
      if (code === 0) { foreground = undefined; background = undefined }
      if (code === 39) foreground = undefined
      if (code === 49) background = undefined
      if (code === 38 || code === 48) {
        const mode = values[++i]
        const count = mode === 2 ? 3 : 1
        const channels = values.slice(i + 1, i + 1 + count)
        const color = mode === 2 ? `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}` : `index:${channels[0]}`
        if (code === 38) foreground = color
        else background = color
        i += count
      }
      if (code !== undefined && (code >= 30 && code <= 37 || code >= 90 && code <= 97)) foreground = `ansi:${code}`
      if (code !== undefined && (code >= 40 && code <= 47 || code >= 100 && code <= 107)) background = `ansi:${code}`
    }
  }
  return cells
}
