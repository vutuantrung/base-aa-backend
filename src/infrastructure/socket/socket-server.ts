import { createSocketGateway } from './socket-gateway.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';
import type { Server as HttpServer } from 'node:http';
import type { SendMessage } from '../../modules/messaging/messaging.js';

export type { SocketMessageHub } from './socket-gateway.js';

/** Compatibility entrypoint for the Socket.IO gateway. */
export function attachSocketServer(http: HttpServer, deps: { sender: SendMessage; corsOrigin: string; apiKey?: string; enableTestPeers?: boolean; transformations?: TransformationRegistry }) {
  return createSocketGateway(http, deps);
}
