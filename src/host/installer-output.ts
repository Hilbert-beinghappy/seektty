/** Redact installer secrets before they reach the terminal or operation receipts. */

export function redactInstallerOutput(value: string): string {
  let redacted = value
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, '$1***@')
    .replace(/(https?:\/\/)[^\s/@]+@/giu, '$1***@')
    .replace(/((?:_authToken|authorization|password|token)\s*[=:]\s*)[^\s]+/giu, '$1***')
  for (const [key, secret] of Object.entries(process.env)) {
    if (!/(?:TOKEN|KEY|SECRET|PASSWORD|AUTH|CREDENTIAL)/iu.test(key) || secret === undefined || secret.length < 4) continue
    redacted = redacted.replaceAll(secret, '***')
  }
  return redacted
}
