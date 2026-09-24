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
  const install = version => `pnpm add --global --config.enable-global-virtual-store=false @deepseek-ai/dsh@${version}`
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
    .replaceAll(
      `| Current tested Harness Host | \`${from}\` |`,
      `| Current tested Harness Host | \`${to}\` |`,
    )
    .replaceAll(
      `| 当前已测 Harness Host | \`${from}\` |`,
      `| 当前已测 Harness Host | \`${to}\` |`,
    )
    .replace(/^\| (?:pnpm 11 layout adapter|pnpm 11 布局适配器) \|.*$/gmu,
      line => line.replace(`dsh \`${from}\``, `dsh \`${to}\``))
    // Published quick-start and rollback commands retain their release pins.
    .replace(/^## (?:Development checkout|开发分支)\r?\n[\s\S]*?(?=^##? |(?![\s\S]))/gmu,
      section => section.replace(/^pnpm add [^\r\n]+/gmu,
        line => line === install(from) ? install(to) : line))
}
