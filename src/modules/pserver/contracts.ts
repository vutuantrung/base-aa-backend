export interface VmInfo {
  udid: string;
  sdk: string;
  model: string;
  abi: string;
  forSearch: boolean;
  platforms: string[];
}

export interface PServerConnectionConfig {
  url: string;
  /** Socket.IO engine path (NOT namespace). The example uses '/ws'. */
  path?: string;
  vmInfo: VmInfo;
  apiKey?: string;
}
