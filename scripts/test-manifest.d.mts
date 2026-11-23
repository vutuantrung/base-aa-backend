export function discoverTestFiles(): string[];
export function validateManifest(manifest: unknown, discoveredFiles: string[]): string[];
export function loadAndValidateManifest(): { entries: Array<{ path: string; profiles: string[]; requirements: Record<string, boolean> }> };
