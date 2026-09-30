/** Harness-owned live configuration for the terminal appearance form. */
import { AppearanceSettingsSchema } from '../management.ts'
export const Config = AppearanceSettingsSchema.volatile()
export function apply(): void {}
