import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { TuiActions } from '../src/client/actions.ts'
import { Session } from '../vendor/client-runtime/client/sessions/session.js'
import { registerRecordedSpillEntryTest } from './fixtures/tool-output-recorded-entry.js'
registerRecordedSpillEntryTest({ Session, HarnessTuiCapabilities, TuiActions })
