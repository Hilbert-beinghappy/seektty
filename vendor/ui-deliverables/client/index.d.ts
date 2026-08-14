import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type DeliverablesKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Produced-files row copy. */
        'deliverables': DeliverablesKey;
    }
}
export { ProducedFiles, type ProducedFilesProps } from './ProducedFiles.tsx';
export { producedForClosing } from './turn-deliverables.ts';
/** Required services for the tail-slot registration and its dictionaries. */
export declare const inject: string[];
/**
 * Client plugin body: register the dictionaries and the turn-tail entry.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map