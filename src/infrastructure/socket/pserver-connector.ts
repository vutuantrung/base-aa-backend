import { createPServerTransport } from './pserver-transport.js';
import { createPServerProtocol, DISPATCH_EVENT, SESSION_CONNECT_EVENT, type PServerGatewayCapabilities } from '../../modules/pserver/pserver-protocol.js';
import type { PServerConnectionConfig } from '../../modules/pserver/contracts.js';

export type { PServerConnectionConfig, VmInfo } from '../../modules/pserver/contracts.js';

export { DISPATCH_EVENT, SESSION_CONNECT_EVENT };

/** Compatibility composition facade for the PServer transport and protocol. */
export function connectToPServer(config: PServerConnectionConfig, gateway: PServerGatewayCapabilities) {
  const { apiKey, ...safeConfig } = config;
  console.log('[AAB] Connecting to PServer with config:', safeConfig);
  if (!config.vmInfo.udid.trim()) throw new Error('PServer VM UDID is required');

  const transport = createPServerTransport(config);
  return createPServerProtocol(config, transport, gateway);
}
