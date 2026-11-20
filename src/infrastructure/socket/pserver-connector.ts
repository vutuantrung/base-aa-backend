import { createPServerTransport } from './pserver-transport.js';
import { createPServerProtocol, DISPATCH_EVENT, SESSION_CONNECT_EVENT, type PServerGatewayCapabilities } from '../../modules/pserver/pserver-protocol.js';

export { DISPATCH_EVENT, SESSION_CONNECT_EVENT };

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

/** Compatibility composition facade for the PServer transport and protocol. */
export function connectToPServer(config: PServerConnectionConfig, gateway: PServerGatewayCapabilities) {
  const { apiKey, ...safeConfig } = config;
  console.log('[AAB] Connecting to PServer with config:', safeConfig);
  if (!config.vmInfo.udid.trim()) throw new Error('PServer VM UDID is required');

  const transport = createPServerTransport(config);
  return createPServerProtocol(config, transport, gateway);
}
