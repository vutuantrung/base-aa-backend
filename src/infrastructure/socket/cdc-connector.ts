import { createCdcTransport } from './cdc-transport.js';
import { createCdcProtocol, DISPATCH_EVENT, SESSION_CONNECT_EVENT, type CdcGatewayCapabilities } from '../../modules/cdc/cdc-protocol.js';
import type { CdcConnectionConfig } from '../../modules/cdc/contracts.js';

export type { CdcConnectionConfig, VmInfo } from '../../modules/cdc/contracts.js';

export { DISPATCH_EVENT, SESSION_CONNECT_EVENT };

/** Composition facade for the CDC transport and protocol. */
export function connectToCdc(config: CdcConnectionConfig, gateway: CdcGatewayCapabilities) {
  const { apiKey, ...safeConfig } = config;
  console.log('[AS] Connecting to CDC with config:', safeConfig);
  if (!config.vmInfo.udid.trim()) throw new Error('CDC VM UDID is required');

  const transport = createCdcTransport(config);
  return createCdcProtocol(config, transport, gateway);
}
