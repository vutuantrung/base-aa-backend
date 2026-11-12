import type { MessageEnvelope } from '../../shared/contracts/message.js';
import type { OutboundTransportAdapter } from '../../modules/messaging/message-router.js';
import type { Destination } from '../../modules/messaging/route-registry.js';
import type { SocketMessageHub } from './socket-server.js';

export class SocketOutboundAdapter implements OutboundTransportAdapter {
  readonly transport = 'socket' as const;
  constructor(private readonly hub: SocketMessageHub) {}
  async deliver(message: MessageEnvelope, destination: Destination): Promise<void> {
    if (destination.transport !== 'socket') throw new Error('Invalid socket destination');
    this.hub.broadcast(destination.channel, message);
  }
}
