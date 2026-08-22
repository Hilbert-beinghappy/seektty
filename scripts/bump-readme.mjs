/**
 * Rewrite only current-tested Host mentions. Historical Release / rollback
 * sentences keep their original versions.
 * @param text - README markdown.
 * @param from - current `dsh.compatibility.tested`.
 * @param to - new tested Host.
 */
export function replaceCurrentTestedMentions(text, from, to) {
  const badgeFrom = from.replaceAll('-', '--')
  const badgeTo = to.replaceAll('-', '--')
  return text
    .replaceAll(
      `https://img.shields.io/badge/DeepSeek%20Harness-${badgeFrom}-`,
      `https://img.shields.io/badge/DeepSeek%20Harness-${badgeTo}-`,
    )
    .replaceAll(`alt="DeepSeek Harness ${from}"`, `alt="DeepSeek Harness ${to}"`)
    .replaceAll(
      `The current tested Host is official \`${from}\``,
      `The current tested Host is official \`${to}\``,
    )
    .replaceAll(
      `当前已测 Host 是官方 \`${from}\``,
      `当前已测 Host 是官方 \`${to}\``,
    )
}
