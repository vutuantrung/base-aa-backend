import type { PeerId, PeerMessage } from '../../modules/peer-messaging/contracts.js';
import type { PeerSocketConnection } from './socket-peer-gateway.js';
import type { PeerSocketDelivery } from '../../modules/peer-messaging/peer-destination-policy.js';
import { ProvenUnsentDeliveryError } from '../../shared/contracts/reliable-delivery.js';

export interface PeerConnectionLookup {
  getConnection(connectionId: string): PeerSocketConnection | undefined;
}

/** M05 physical lookup, peer:message emission, timeout and ACK interpretation. */
export class SocketPeerMessageDelivery implements PeerSocketDelivery {
  constructor(private readonly connections: PeerConnectionLookup) {}

  async deliver(peerId: PeerId, connectionId: string, message: PeerMessage): Promise<void> {
    const target = this.connections.getConnection(connectionId);
    if (!target) throw new ProvenUnsentDeliveryError(`Destination ${peerId} is offline`);
    const response = await target.emitWithAck<{ ok?: boolean }>('peer:message', message, 5000);
    if (!response?.ok) throw new Error(`Destination ${peerId} rejected message`);
  }
}
