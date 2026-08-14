import type { HostDescriptionSource } from '@deepseek-ai/dsh-client-connection/client';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { NS } from './locales.ts';
/**
 * Select the largest prefix whose measured chips and exact remainder fit.
 * @param available - usable width of the one-line file lane.
 * @param gap - computed flex gap between adjacent visible items.
 * @param chipWidths - measured widths for the candidate file chips.
 * @param moreWidthsByShown - exact localized remainder width for each shown count.
 * @returns Number of leading chips to render.
 */
export declare function fitProducedFiles(available: number, gap: number, chipWidths: readonly number[], moreWidthsByShown: readonly (number | undefined)[]): number;
/** Registration-side Host capability facts. */
export interface ProducedFilesInjected {
    /** Whether the browser itself is connected over loopback. */
    isLoopback: boolean;
    hooks: {
        /** Current generation's Host description, bound by the slot renderer. */
        hostDescription: HostDescriptionSource;
    };
}
/** Matched paths plus the opener, locale, and injected Host capability. */
export type ProducedFilesProps = Pick<TurnTailOwnerProps, 'openFile'> & {
    matched: readonly string[];
} & PropsLocale<typeof NS> & InjectFace<ProducedFilesInjected>;
/**
 * Render one turn's produced files as openable chips.
 * @param props - selector-matched paths, the chat view's file opener, and the locale seat.
 * @returns The produced-files row.
 */
export declare function ProducedFiles({ matched: paths, openFile, isLoopback, useHostDescription, t, }: ProducedFilesProps): import("react").JSX.Element;
//# sourceMappingURL=ProducedFiles.d.ts.map