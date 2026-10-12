/** Harness-owned live configuration for the terminal marketplace form. */
import { MarketplaceSettingsSchema } from '../management.ts'
import { liveKnownFields } from './live-fields.ts'
export const Config = liveKnownFields(MarketplaceSettingsSchema)
export function apply(): void {}
