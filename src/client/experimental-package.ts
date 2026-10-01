/** Matches the published dsh ui-plugin-manager 0.2.0-rc.2 package badge rule. */
export function isExperimentalPackage(name: string): boolean {
  return name.startsWith('@deepseek-ai/dsh-experimental-')
}

/** Presentation only: package identity, selection and activation remain unchanged. */
export function pluginDisplayIdentity(plugin: { readonly name: string; readonly version?: string }, locale: string): string {
  const identity = `${plugin.name}${plugin.version === undefined ? '' : `@${plugin.version}`}`
  return isExperimentalPackage(plugin.name)
    ? `${locale === 'zh' ? '实验性' : 'Experimental'} · ${identity}` : identity
}
