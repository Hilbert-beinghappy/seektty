export function isForbiddenPackEntry(entry) {
  return entry.split(/[/\\]/).some((segment) => (
    segment.startsWith('._') || segment === '.DS_Store'
  ))
}
