import { describe, expect, it } from 'vitest'
import {
  DISABLE_MOUSE_TRACKING,
  ENABLE_MOUSE_TRACKING,
  isMouseInput,
  mouseWheelDirection,
} from '../src/client/mouse.ts'

describe('terminal mouse wheel', () => {
  it('enables SGR reports and restores both terminal modes', () => {
    expect(ENABLE_MOUSE_TRACKING).toBe('\u001B[?1000h\u001B[?1006h')
    expect(DISABLE_MOUSE_TRACKING).toBe('\u001B[?1006l\u001B[?1000l')
  })

  it('reads vertical SGR wheel events without treating clicks as scrolls', () => {
    expect(mouseWheelDirection('\u001B[<64;40;12M')).toBe('up')
    expect(mouseWheelDirection('\u001B[<69;40;12M')).toBe('down')
    expect(mouseWheelDirection('\u001B[<0;40;12M')).toBeUndefined()
    expect(mouseWheelDirection('\u001B[<66;40;12M')).toBeUndefined()
    expect(mouseWheelDirection('\u001B[<64;40;12m')).toBeUndefined()
    expect(isMouseInput('\u001B[<0;40;12M')).toBe(true)
    expect(isMouseInput('\u001B[<0;40;12m')).toBe(true)
    expect(isMouseInput('普通输入')).toBe(false)
  })

  it('accepts legacy xterm wheel reports', () => {
    expect(mouseWheelDirection(`\u001B[M${String.fromCharCode(96, 33, 33)}`)).toBe('up')
    expect(mouseWheelDirection(`\u001B[M${String.fromCharCode(97, 33, 33)}`)).toBe('down')
  })
})
