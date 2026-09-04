/** Reuse a failed forward search only where native RegExp semantics prove it safe. */
export function cacheFailedRegexSearch(regex: RegExp): RegExp {
  // EmulatedRegExp can clip the input at lastIndex for Oniguruma search anchors.
  // A miss on such an engine does not imply that a later search also misses.
  if (Object.getPrototypeOf(regex) !== RegExp.prototype || !regex.global || regex.sticky
    || regex.exec !== RegExp.prototype.exec) return regex
  const execute = regex.exec
  let failedText: string | undefined
  let failedStart = 0
  regex.exec = function (text: string): RegExpExecArray | null {
    const start = this.lastIndex
    if (this !== regex || typeof text !== 'string' || !Number.isInteger(start) || start < 0) {
      failedText = undefined
      return execute.call(this, text)
    }
    // Unicode exec can round a start inside a surrogate pair backwards. Keep
    // those calls on the original engine, as well as non-scanner invocations.
    const low = text.charCodeAt(start)
    const cacheable = text.length <= 4096
      && !(low >= 0xDC00 && low <= 0xDFFF)
    if (cacheable && text === failedText && start >= failedStart) {
      this.lastIndex = 0
      return null
    }
    const match = execute.call(this, text)
    if (cacheable && match === null) {
      failedText = text
      failedStart = start
    } else {
      failedText = undefined
    }
    return match
  }
  return regex
}
