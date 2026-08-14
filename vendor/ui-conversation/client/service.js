/**
 * Scope-addressed conversation send, cancel, and history orchestration.
 *
 * Scope addressing rides the cordis Service tracker: property access through
 * `ctx.conversation` rebinds `this.ctx` to the caller's context, so methods
 * read the session tag with `scopeOf`. Mutable state must remain reachable
 * through one property read; assignment through the tracker proxy and `#`
 * private fields bypass that rebinding.
 */
import { Service } from '@deepseek-ai/cordis';
/** Create one browser-only draft descriptor; only its id enters input state. */
function browserDraftAttachment(file) {
    return {
        kind: 'image',
        id: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
        file,
    };
}
/** Unsupported browser-declared image type, localized by the UI boundary. */
export class UnsupportedImageMediaTypeError extends Error {
    /** Browser-declared MIME value, possibly empty. */
    mediaType;
    /** @param mediaType - Browser-declared MIME value, possibly empty. */
    constructor(mediaType) {
        super(`unsupported image media type: ${mediaType || '(empty)'}`);
        this.name = 'UnsupportedImageMediaTypeError';
        this.mediaType = mediaType;
    }
}
/** Scope-addressed conversation service (root singleton, provided as `conversation`). */
export class ConversationController extends Service {
    /** The per-session input machine registry (SessionInputResolver face). */
    input;
    /** The per-session composer-block registry. */
    blocks;
    draftAttachments = new Map();
    imageUrls = new Map();
    imageGenerations = new Map();
    createdImageUrls = new Set();
    disposed = false;
    /**
     * @param ctx - owning root context (the plugin apply context; the service
     * registers itself and follows that fiber's lifetime).
     * @param config - carries the SessionInputResolver and composer-block registry
     * constructed by the plugin apply (the same instances the slot inject
     * factories close over).
     */
    constructor(ctx, config) {
        super(ctx, 'conversation');
        this.input = config.input;
        this.blocks = config.blocks;
        ctx.effect(() => () => {
            this.disposed = true;
            for (const url of this.createdImageUrls)
                revokePreview(url);
            this.createdImageUrls.clear();
            this.draftAttachments.clear();
            this.imageUrls.clear();
            this.imageGenerations.clear();
        }, 'conversation attachment URL cache');
    }
    /**
     * Send a prompt into the scoped session. Business failures also land in the
     * session snapshot's promptError (object-layer state); the rejection here
     * exists for caller choreography (the composer restores the draft on it).
     * @param text - prompt text, sent verbatim as one text block.
     */
    async send(text) {
        const session = this.scopedSession('send');
        const result = await session.prompt([{ type: 'text', text }], 'queue');
        if (!result.ok)
            throw new Error(`conversation.send failed: ${result.error.code}: ${result.error.message}`);
    }
    /**
     * Submit ordered draft images with text through one host admission.
     * @param session - target session.
     * @param text - serialized prompt text.
     * @param imageIds - ordered draft-local attachment ids.
     * @param mode - queue or steer delivery selected by composer policy.
     */
    async sendSession(session, text, imageIds, mode) {
        const attachments = this.draftImages(imageIds);
        if (attachments.length !== imageIds.length) {
            throw new Error('conversation.sendSession: one or more draft images are no longer available');
        }
        const uploaded = await this.serializeImages(attachments.map(attachment => attachment.file));
        const content = [...uploaded, ...(text === '' ? [] : [{ type: 'text', text }])];
        const result = await session.prompt(content, mode);
        if (!result.ok)
            throw new Error(`conversation.send failed: ${result.error.code}: ${result.error.message}`);
        this.releaseDraftImages(attachments);
    }
    /**
     * Create runtime-only draft images and their object URLs.
     * @param files - browser files to register after MIME validation.
     * @returns ordered draft descriptors.
     */
    createDraftImages(files) {
        for (const file of files)
            imageMediaType(file.type);
        return files.map((file) => {
            const attachment = browserDraftAttachment(file);
            this.draftAttachments.set(attachment.id, attachment);
            this.createdImageUrls.add(attachment.previewUrl);
            return attachment;
        });
    }
    /**
     * Resolve ordered input-state ids to runtime-owned draft images.
     * @param ids - draft attachment ids.
     * @returns descriptors that remain live, in requested order.
     */
    draftImages(ids) {
        const attachments = [];
        for (const id of ids) {
            const attachment = this.draftAttachments.get(id);
            if (attachment !== undefined)
                attachments.push(attachment);
        }
        return attachments;
    }
    /**
     * Release one browser-owned draft image and preview URL.
     * @param id - draft attachment id.
     */
    releaseDraftImage(id) {
        const attachment = this.draftAttachments.get(id);
        if (attachment === undefined)
            return;
        this.draftAttachments.delete(id);
        this.createdImageUrls.delete(attachment.previewUrl);
        revokePreview(attachment.previewUrl);
    }
    /**
     * Release a set of browser-owned draft images.
     * @param attachments - descriptors to release.
     */
    releaseDraftImages(attachments) {
        for (const attachment of attachments)
            this.releaseDraftImage(attachment.id);
    }
    /**
     * Resolve and cache one session-authorized historical image URL.
     * @param sessionId - owning session authorization scope.
     * @param attachment - durable image reference.
     * @returns browser URL valid until its rendered session is released.
     */
    resolveImage(sessionId, attachment) {
        if (this.disposed)
            return Promise.reject(new Error('conversation.resolveImage: service is disposed'));
        const key = `${sessionId}:${attachment.attachmentId}`;
        const cached = this.imageUrls.get(key);
        if (cached !== undefined)
            return cached.pending;
        const generation = this.imageGenerations.get(sessionId) ?? 0;
        const session = this.requireSessions().binding(sessionId)?.session;
        if (session === undefined) {
            return Promise.reject(new Error(`conversation.resolveImage: unknown session "${sessionId}"`));
        }
        const pending = session.readAttachment(attachment.attachmentId)
            .then((result) => {
            if (!result.ok)
                throw new Error(`${result.error.code}: ${result.error.message}`);
            if (this.disposed)
                throw new Error('conversation.resolveImage: service was disposed before loading completed');
            if ((this.imageGenerations.get(sessionId) ?? 0) !== generation) {
                throw new Error('historical image scope was released before loading completed');
            }
            if (typeof URL.createObjectURL !== 'function') {
                return `data:${result.value.attachment.mediaType};base64,${bytesToBase64(result.value.data)}`;
            }
            const bytes = Uint8Array.from(result.value.data);
            const url = URL.createObjectURL(new Blob([bytes.buffer], { type: result.value.attachment.mediaType }));
            this.createdImageUrls.add(url);
            return url;
        })
            .catch((error) => {
            if (this.imageUrls.get(key)?.generation === generation)
                this.imageUrls.delete(key);
            throw error;
        });
        this.imageUrls.set(key, { sessionId, generation, pending });
        return pending;
    }
    /**
     * Release every historical image URL owned by one rendered session.
     * @param sessionId - rendered session scope.
     */
    releaseSessionImages(sessionId) {
        this.imageGenerations.set(sessionId, (this.imageGenerations.get(sessionId) ?? 0) + 1);
        for (const [key, entry] of this.imageUrls) {
            if (entry.sessionId !== sessionId)
                continue;
            this.imageUrls.delete(key);
            void entry.pending.then((url) => {
                if (!this.createdImageUrls.delete(url))
                    return;
                revokePreview(url);
            }, () => {
                // A failed or invalidated load owns no object URL.
            });
        }
    }
    /** Apply one operation to a pending queue occurrence. */
    async updateQueue(itemId, action) {
        const session = this.scopedSession('updateQueue');
        const result = await session.updateQueue(itemId, action);
        if (!result.ok) {
            if (action.kind === 'steer'
                && (result.error.code === 'steer-unavailable' || result.error.code === 'queue-item-not-found'))
                return;
            throw new Error(`conversation.updateQueue failed: ${result.error.code}: ${result.error.message}`);
        }
    }
    /** Cancel the scoped session's in-flight turn while preserving Queue (failures land in promptError and reject, as in send). */
    async cancel() {
        const session = this.scopedSession('cancel');
        const result = await session.cancel();
        if (!result.ok)
            throw new Error(`conversation.cancel failed: ${result.error.code}: ${result.error.message}`);
    }
    /** Pull one older history page for the scoped Session. */
    async loadOlder() {
        await this.scopedSession('loadOlder').loadOlder();
    }
    /** Resolve the caller scope's session face or throw on root contexts. */
    scopedSession(op) {
        const id = this.scopeId(op);
        const binding = this.requireSessions().binding(id);
        if (binding === undefined)
            throw new Error(`conversation.${op}: session "${id}" resolved no binding`);
        return binding.session;
    }
    /** Read the caller's session scope tag via the sessions service; root contexts fail loud. */
    scopeId(op) {
        const id = this.requireSessions().scopeOf(this.ctx);
        if (id === undefined) {
            throw new Error(`conversation.${op} requires a session scope — address one via ctx.sessions.scope(id).conversation`);
        }
        return id;
    }
    requireSessions() {
        // Strict ctx.get, not the injection proxy: the scope-addressed pattern
        // reads the service off whatever context the tracker rebound.
        const sessions = this.ctx.get('sessions');
        if (sessions === undefined)
            throw new Error('conversation: sessions service unavailable');
        return sessions;
    }
    /** Convert browser files to canonical base64 prompt parts. */
    serializeImages(images) {
        return Promise.all(images.map(async (file) => ({
            type: 'image',
            mediaType: imageMediaType(file.type),
            data: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
            ...(file.name === '' ? {} : { name: file.name }),
        })));
    }
}
function imageMediaType(value) {
    switch (value) {
        case 'image/png':
        case 'image/jpeg':
        case 'image/webp':
        case 'image/gif':
            return value;
        default:
            throw new UnsupportedImageMediaTypeError(value);
    }
}
function bytesToBase64(data) {
    let binary = '';
    const chunk = 0x8000;
    for (let offset = 0; offset < data.length; offset += chunk) {
        binary += String.fromCharCode(...data.subarray(offset, offset + chunk));
    }
    return btoa(binary);
}
function revokePreview(url) {
    if (url.startsWith('blob:'))
        URL.revokeObjectURL(url);
}
//# sourceMappingURL=service.js.map