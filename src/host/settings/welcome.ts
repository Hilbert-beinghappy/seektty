/** Harness-owned live configuration for the terminal welcome form. */
import { WelcomeSettingsSchema } from '../management.ts'
export const Config = WelcomeSettingsSchema.volatile()
export function apply(): void {}
