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

export type TransportEventHandler = (...arguments_: unknown[]) => void;

export interface PServerTransport {
  readonly connected: boolean;
  on(event: string, handler: TransportEventHandler): () => void;
  emitWithAck<T>(event: string, payload: unknown, timeoutMs: number): Promise<T>;
  connect(): void;
  close(): void;
}
