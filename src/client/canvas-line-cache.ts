import { visibleWidth } from '@mariozechner/pi-tui'
import { background, canvasStyleRevision, terminalColorLevel } from './theme.ts'
import { StringTransformCache } from './string-transform-cache.ts'

/** Exact memoization, bounded by both retained characters and entry count. */
export class CanvasLineCache {
  private width = 0
  private readonly lines = new StringTransformCache(line => background.canvas(
    `${line}${' '.repeat(Math.max(0, this.width - visibleWidth(line)))}`,
  ))
  private context = ''
  private previousInput: string[] = []
  private previousOutput: string[] = []

  render(lines: readonly string[], width: number): string[] {
    const context = `${width}:${canvasStyleRevision()}:${terminalColorLevel()}`
    if (context !== this.context) {
      this.lines.clear(); this.context = context; this.width = width
      this.previousInput = []; this.previousOutput = []
    }
    const result = lines.map((line, index) => line === this.previousInput[index]
      ? this.previousOutput[index]!
      : this.lines.get(line))
    this.previousInput = [...lines]; this.previousOutput = [...result]
    return result
  }
}
