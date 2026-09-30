/** Stateful redaction of pnpm installer streams that may split secrets across chunks. */
const INSTALLER_OUTPUT_LIMIT = 1024 * 1024;
const DEFAULT_HOLD = 512;
function appendBounded(current, chunk, maxBytes) {
	const joined = current + chunk;
	if (Buffer.byteLength(joined) <= maxBytes) return joined;
	let start = Math.max(0, joined.length - maxBytes);
	while (start < joined.length && Buffer.byteLength(joined.slice(start)) > maxBytes) start += 1;
	return joined.slice(start);
}
/**
* Collect environment values that must never appear in installer output.
* @param env - process environment.
*/
function installerSecrets(env = process.env) {
	return Object.entries(env).flatMap(([key, secret]) => {
		if (secret === void 0 || secret.length < 4) return [];
		if (!/(?:TOKEN|KEY|SECRET|PASSWORD|AUTH|CREDENTIAL)/iu.test(key)) return [];
		return [secret];
	});
}
/**
* Redact credentials in one complete installer fragment.
* @param value - text that will not be extended by a later chunk.
* @param secrets - explicit environment secrets to erase.
*/
function redactInstallerText(value, secrets = []) {
	let redacted = value.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1***@").replace(/(https?:\/\/)[^\s/@]+@/giu, "$1***@").replace(/((?:_authToken|authorization|password|token)\s*[=:]\s*)[^\s]+/giu, "$1***");
	for (const secret of secrets) if (secret.length >= 4) redacted = redacted.replaceAll(secret, "***");
	return redacted;
}
function holdLength(secrets, hold) {
	const longest = secrets.reduce((max, secret) => Math.max(max, secret.length), 0);
	return Math.max(hold, longest + 32);
}
/** One stdout or stderr stream that only releases prefixes that cannot complete a later secret match. */
var InstallerOutputRedactor = class {
	pending = "";
	released = "";
	secrets;
	maxBytes;
	hold;
	constructor(options = {}) {
		this.secrets = options.secrets ?? installerSecrets();
		this.maxBytes = options.maxBytes ?? INSTALLER_OUTPUT_LIMIT;
		this.hold = holdLength(this.secrets, options.hold ?? DEFAULT_HOLD);
	}
	/**
	* Absorb one chunk and return only the redacted prefix that is safe to display.
	* @param chunk - raw installer bytes.
	*/
	push(chunk) {
		this.pending += chunk;
		const split = this.splitIndex(this.pending);
		if (split <= 0) return "";
		const emit = redactInstallerText(this.pending.slice(0, split), this.secrets);
		this.pending = this.pending.slice(split);
		this.released = appendBounded(this.released, emit, this.maxBytes);
		return emit;
	}
	splitIndex(value) {
		let split = value.length - this.hold;
		if (split < 0) split = 0;
		const url = /https?:\/\/\S*$/iu.exec(value);
		if (url !== null && url.index < split) split = url.index;
		const token = /(?:_authToken|authorization|password|token)\s*[=:]\s*\S*$/iu.exec(value);
		if (token !== null && token.index < split) split = token.index;
		return split;
	}
	/** Redact and release every held suffix. */
	flush() {
		const emit = redactInstallerText(this.pending, this.secrets);
		this.pending = "";
		this.released = appendBounded(this.released, emit, this.maxBytes);
		return emit;
	}
	/** Bounded redacted capture for the completed stream. */
	text() {
		return this.released;
	}
};

export { installerSecrets as n, redactInstallerText as r, InstallerOutputRedactor as t };