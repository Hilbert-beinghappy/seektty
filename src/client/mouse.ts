/** Terminal mouse-wheel protocol used to browse the conversation without moving editor focus. */

/** Enable basic mouse events and SGR coordinates on terminals that implement xterm tracking. */
export const ENABLE_MOUSE_TRACKING = '\u001B[?1000h\u001B[?1006h'

/** Restore terminal mouse handling before returning control to the shell. */
export const DISABLE_MOUSE_TRACKING = '\u001B[?1006l\u001B[?1000l'

/** Direction reported by a vertical terminal mouse-wheel event. */
export type MouseWheelDirection = 'up' | 'down'

const SGR_MOUSE = /^\u001B\[<(\d+);\d+;\d+([Mm])$/u

/** Return whether one complete input sequence is any SGR or legacy mouse report. */
export function isMouseInput(data: string): boolean {
  return SGR_MOUSE.test(data) || (data.length === 6 && data.startsWith('\u001B[M'))
}

function wheelDirection(button: number): MouseWheelDirection | undefined {
  if ((button & 64) === 0) return undefined
  const axis = button & 3
  return axis === 0 ? 'up' : axis === 1 ? 'down' : undefined
}

/**
 * Read vertical wheel input from SGR or legacy xterm mouse reports.
 * @param data - one complete terminal input sequence.
 * @returns wheel direction, or undefined for clicks, motion, and horizontal wheels.
 */
export function mouseWheelDirection(data: string): MouseWheelDirection | undefined {
  const sgr = SGR_MOUSE.exec(data)
  if (sgr !== null) return sgr[2] === 'M' ? wheelDirection(Number(sgr[1])) : undefined
  if (data.length === 6 && data.startsWith('\u001B[M')) {
    return wheelDirection(data.charCodeAt(3) - 32)
  }
  return undefined
}
