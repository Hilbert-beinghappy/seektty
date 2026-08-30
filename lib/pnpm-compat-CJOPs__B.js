/**
* Temporary pnpm 11 compatibility policy for the supported dsh releases.
*
* dsh/Cordis currently resolves plugin trees incorrectly when pnpm's Global
* Virtual Store materializes packages below `store/v11/links`. SeekTTY keeps
* every package-tree mutation local to the invoking command until the Host
* fixes the loader. It never changes the user's global pnpm configuration.
*/
const PNPM_GVS_CONFIG_ARG = "--config.enable-global-virtual-store=false";
/** Exact Host range to which this compatibility adapter applies. */
const PNPM_GVS_DSH_RANGE = ">=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2";
/** Host and pnpm versions used by the release acceptance gate. */
const PNPM_GVS_TESTED_WITH = Object.freeze({
	dsh: "0.1.1-rc.2",
	pnpm: "11.7.0"
});
const MUTATING_PNPM_COMMANDS = new Set([
	"add",
	"install",
	"remove",
	"rm",
	"uninstall",
	"update",
	"up"
]);
const GVS_CONFIG_PREFIX = "--config.enable-global-virtual-store=";
const SENSITIVE_QUERY_KEY = /(?:^|[-_])(?:access[-_]?token|api[-_]?key|auth|authorization|credential|password|secret|signature|token)(?:$|[-_])/iu;
/** True when these pnpm arguments can materialize or replace a package tree. */
function mutatesPnpmPackageTree(args) {
	return args[0] !== void 0 && MUTATING_PNPM_COMMANDS.has(args[0]);
}
/**
* Apply the per-invocation compatibility flag to a pnpm package-tree change.
* Existing values are normalized to the safe value so internal callers cannot
* accidentally re-enable the incompatible layout.
*/
function withPnpmGvsCompatibility(args) {
	if (!mutatesPnpmPackageTree(args)) return [...args];
	const [command, ...rest] = args;
	const leadingGlobal = rest[0] === "--global" ? ["--global"] : [];
	const remaining = leadingGlobal.length === 0 ? rest : rest.slice(1);
	return [
		command,
		...leadingGlobal,
		PNPM_GVS_CONFIG_ARG,
		...remaining.filter((argument) => !argument.startsWith(GVS_CONFIG_PREFIX))
	];
}
/** Build the official dsh plugin-manager command with the same pnpm policy. */
function dshPluginArgs(profile, args) {
	return [
		"plugin",
		"--profile",
		profile,
		...withPnpmGvsCompatibility(args)
	];
}
function quoteCommandArgument(argument) {
	if (/^[A-Za-z0-9_./:@%+,=#\\-]+$/u.test(argument)) return argument;
	return `'${argument.replaceAll("'", "''")}'`;
}
/** Remove URL credentials from command text while leaving the executed spec unchanged. */
function redactPnpmCommandArgument(argument) {
	const prefix = argument.startsWith("git+") ? "git+" : "";
	const raw = prefix === "" ? argument : argument.slice(prefix.length);
	if (!/^(?:https?|ssh):\/\//iu.test(raw)) return argument;
	try {
		const url = new URL(raw);
		if (url.username !== "" || url.password !== "") {
			url.username = "***";
			url.password = "";
		}
		for (const key of [...url.searchParams.keys()]) if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.set(key, "***");
		return `${prefix}${url.toString()}`;
	} catch {
		return argument.replace(/((?:git\+)?(?:https?|ssh):\/\/)[^\s/@]+@/iu, "$1***@");
	}
}
/** Human-readable command text for confirmations, errors, and documentation. */
function pnpmCommand(args) {
	return ["pnpm", ...withPnpmGvsCompatibility(args)].map(redactPnpmCommandArgument).map(quoteCommandArgument).join(" ");
}
/** Human-readable dsh plugin command using the native Profile manager. */
function dshPluginCommand(profile, args) {
	return ["dsh", ...dshPluginArgs(profile, args)].map(redactPnpmCommandArgument).map(quoteCommandArgument).join(" ");
}
/** True only for pnpm 11's Global Virtual Store link-tree path. */
function isPnpmGlobalVirtualStorePath(value) {
	return /(?:^|[/\\])store[/\\]v11[/\\]links(?:[/\\]|$)/iu.test(value);
}
/**
* Classify the known dsh/Cordis loader failure without matching unrelated pnpm
* errors. Both the GVS layout and a loader signature must be present.
*/
function isKnownPnpmGvsLoaderFailure(output) {
	if (!isPnpmGlobalVirtualStorePath(output)) return false;
	return /(?:plugin tree failed to load|loader entries failed to apply|cordis(?::|[/\\-])include|cordis-plugin-(?:include|loader))/iu.test(output);
}
/** Bilingual recovery advice for the known incompatible layout. */
function pnpmGvsRecoveryAdvice(options) {
	const installDsh = pnpmCommand([
		"add",
		"--global",
		options.dshSpec
	]);
	const installPlugin = dshPluginCommand(options.profile, ["add", options.pluginSpec]);
	return options.english ? [
		"Detected pnpm 11's Global Virtual Store layout (`store/v11/links`) after dsh exited unsuccessfully.",
		"If the output above mentions `plugin tree failed to load`, `cordis:include`, or loader entries, this is the known dsh/Cordis layout incompatibility.",
		"SeekTTY does not change global pnpm settings. Reinstall with the per-command compatibility option:",
		`  ${installDsh}`,
		`  ${installPlugin}`
	].join("\n") : [
		"dsh 异常退出后检测到 pnpm 11 Global Virtual Store 布局（`store/v11/links`）。",
		"如果上方输出包含 `plugin tree failed to load`、`cordis:include` 或 loader entries，则属于已知的 dsh/Cordis 布局兼容问题。",
		"SeekTTY 不会修改全局 pnpm 设置。请使用仅作用于本次命令的兼容参数重新安装：",
		`  ${installDsh}`,
		`  ${installPlugin}`
	].join("\n");
}

export { isKnownPnpmGvsLoaderFailure as a, pnpmGvsRecoveryAdvice as c, dshPluginCommand as i, withPnpmGvsCompatibility as l, PNPM_GVS_DSH_RANGE as n, isPnpmGlobalVirtualStorePath as o, dshPluginArgs as r, pnpmCommand as s, PNPM_GVS_CONFIG_ARG as t };