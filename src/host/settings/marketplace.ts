/** Harness-owned live configuration for the terminal marketplace form. */
import { MarketplaceSettingsSchema } from '../management.ts'
export const Config = MarketplaceSettingsSchema.volatile()
export function apply(): void {}
