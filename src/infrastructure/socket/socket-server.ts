import { createSocketGateway } from './socket-gateway.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';
import type { Server as HttpServer } from 'node:http';
import type { MessageSender } from '../../modules/messaging/messaging.js';
import type { ReliabilityRunnerPolicy } from '../../shared/persistence/reliable-outbox-runner.js';

export type { SocketMessageHub } from './socket-gateway.js';

/** Compatibility entrypoint for the Socket.IO gateway. */
export function attachSocketServer(http: HttpServer, deps: {
  sender: MessageSender; corsOrigin: string; apiKey?: string; enableTestPeers?: boolean;
  transformations?: TransformationRegistry; reliabilityPolicy?: ReliabilityRunnerPolicy
}) {
  return createSocketGateway(http, deps);
}
