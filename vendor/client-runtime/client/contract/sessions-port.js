/**
 * Cross-domain sessions face: the contract surface sibling domains (today:
 * workspaces) consume instead of the sessions implementation. The sessions
 * domain satisfies it structurally — SessionRuntime is assignable, checked
 * wherever the assembly layer or a test injects the real service — so
 * widening this face is the explicit act of widening the inter-domain
 * dependency.
 */
export {};
//# sourceMappingURL=sessions-port.js.map