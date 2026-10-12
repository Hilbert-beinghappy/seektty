/** Harness-owned live configuration for the terminal behavior form. */
import { BehaviorSettingsSchema } from '../management.ts'
export const Config = BehaviorSettingsSchema.volatile()
export function apply(): void {}
