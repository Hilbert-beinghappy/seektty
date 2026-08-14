/**
 * Deliverables plugin, node half. Registers the response-format guidance that
 * lets the browser half recognize final-response file references. The browser
 * half ships via exports["./client"], discovered through the package.json
 * dsh.client declaration.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Services required for the model guidance paired with the browser renderer. */
export declare const inject: string[];
/**
 * Register model guidance for the file-reference renderer shipped by this package.
 * @param ctx - host context carrying the system-prompt registry.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map