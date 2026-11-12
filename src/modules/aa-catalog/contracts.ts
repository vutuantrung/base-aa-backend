export interface AaConnection {
  id: string; userId: string; status: string;
  connectedTime: number; lastHeartbeatTime: number; disconnectedTime: number;
}
export interface BrowserDetails {
  id: string; type: string; version: string; userAgent: string; proxy: string; extensionId: string;
}
export interface BrowserResult { browser: BrowserDetails }
export interface ParserInfo { version: string; type: string[] }
export interface PlatformSupport {
  supportingFeatures: string[]; parserInfo?: ParserInfo;
}
/** Platform names are keys (facebook/tiktok), as in the supplied response. */
export interface ExtensionDetails {
  id: string; version: string;
  supportingPlatforms: Array<Record<string, PlatformSupport>>;
}
export interface ExtensionActivity {
  id: string; name: string; createdTime: number; updatedTime: number;
  extensionConfigId: string; extraMeta: Record<string, unknown>;
  inputs: Record<string, unknown>; platform: 'Facebook' | 'Tiktok' | 'Threads';
  priority: 0 | 1 | 2; scheduleTime: string; scheduleType: 'period' | 'alarm';
}
export interface ExtensionTask {
  id: string; activity: { id: string; name: string };
  createdTime: number; updatedTime: number; endTime: number;
  inputs: Record<string, unknown>; nextTask: string;
  platform: 'facebook' | 'tiktok' | 'threads';
  priority: 0 | 1 | 2;
  state: 'pending' | 'finished' | 'executing' | 'failed';
  tabId: number;
}
/** Only queries requested by api-data.json. Data write operations are internal. */
export interface AaCatalogRepository {
  currentAa(): AaConnection | undefined;
  allBrowsers(): BrowserResult[];
  browserById(id: string): BrowserResult | undefined;
  extensionById(id: string): ExtensionDetails | undefined;
  activitiesByExtension(id: string): ExtensionActivity[];
  tasksByExtension(id: string): ExtensionTask[];
}
