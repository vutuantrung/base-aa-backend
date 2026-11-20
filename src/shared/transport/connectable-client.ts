/** Legacy compatibility facade; maintained callers should import from infrastructure/integration-clients. */
export type { ConnectableMessageClient } from './connectable-message-client.js';
export { HttpMessageClient, SocketMessageClient } from '../../infrastructure/integration-clients/index.js';
