/**
 * The settings-namespace scope contract. The type lives here, in the common
 * dependency of every feature that owns a preference, while the implementation
 * and its Host transport live with the Settings surface
 * (`dsh-client-ui-settings`): a feature service accepts a scope through
 * `attachSettings` without depending on the surface that binds it, which would
 * otherwise close a reference cycle.
 */
export {};
//# sourceMappingURL=settings-scope.js.map