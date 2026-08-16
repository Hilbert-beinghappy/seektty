/** Dynamic slash-command and file completion for the pi-tui Editor. */

import {
  CombinedAutocompleteProvider,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type SlashCommand,
} from '@mariozechner/pi-tui'
import type { HarnessTuiCapabilities } from './capabilities.ts'
import { translateUiText } from './locale.ts'
import { escapeTerminalText } from './theme.ts'

/** Autocomplete provider that repulls only through the Harness-backed catalog cache. */
export class HarnessAutocompleteProvider implements AutocompleteProvider {
  /**
   * @param capabilities - current-session Harness catalog controller.
   * @param onError - non-blocking terminal diagnostic sink.
   */
  constructor(
    private readonly capabilities: HarnessTuiCapabilities,
    private readonly onError: (message: string) => void,
  ) {}

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    try {
      const catalog = await this.capabilities.commandCatalog(options.signal)
      if (options.signal.aborted) return null
      const commands: SlashCommand[] = catalog.map(command => ({
        name: command.name,
        description: escapeTerminalText(translateUiText(command.description)),
        ...(command.argumentHint === undefined
          ? {}
          : { argumentHint: escapeTerminalText(translateUiText(command.argumentHint)) }),
      }))
      const basePath = this.capabilities.active()?.workspacePath ?? process.cwd()
      const suggestions = await new CombinedAutocompleteProvider(commands, basePath).getSuggestions(
        lines,
        cursorLine,
        cursorCol,
        options,
      )
      return suggestions === null
        ? null
        : {
          ...suggestions,
          items: suggestions.items.map(item => ({
            ...item,
            value: escapeTerminalText(item.value),
            label: escapeTerminalText(item.label),
            ...(item.description === undefined
              ? {}
              : { description: escapeTerminalText(item.description) }),
          })),
        }
    } catch (error) {
      if (!options.signal.aborted) {
        this.onError(error instanceof Error ? error.message : String(error))
      }
      return null
    }
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const currentPrefix = (lines[cursorLine] ?? '').slice(0, cursorCol)
    if (prefix.startsWith('/') && currentPrefix !== prefix) {
      return { lines, cursorLine, cursorCol }
    }
    const basePath = this.capabilities.active()?.workspacePath ?? process.cwd()
    return new CombinedAutocompleteProvider([], basePath).applyCompletion(
      lines,
      cursorLine,
      cursorCol,
      item,
      prefix,
    )
  }

  shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
    const basePath = this.capabilities.active()?.workspacePath ?? process.cwd()
    return new CombinedAutocompleteProvider([], basePath)
      .shouldTriggerFileCompletion(lines, cursorLine, cursorCol)
  }
}
