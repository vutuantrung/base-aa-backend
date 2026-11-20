import type { IncomingPeerMessage, PeerId, PeerMessage } from './contracts.js';
import { PeerMessageError, type PeerDelivery } from './peer-message-service.js';
import type { DirectoryPeerId, PeerIdentity } from './peer-directory.js';

export interface PeerDirectoryCapabilities {
  has(peerId: DirectoryPeerId, instanceId?: string): boolean;
  lookup(peerId: DirectoryPeerId, instanceId?: string): PeerIdentity | undefined;
  listInstances(peerId: 'eserver'): PeerIdentity[];
}

export interface PeerSocketDelivery {
  deliver(peerId: DirectoryPeerId, connectionId: string, message: PeerMessage): Promise<void>;
}

export interface PServerPeerTransport {
  isConnected(): boolean;
  deliver(message: PeerMessage): Promise<void>;
}

/** M10 destination policy over M06 identity and transport delivery capabilities. */
export class PeerDestinationPolicy implements PeerDelivery {
  private pserverTransport: PServerPeerTransport | undefined;

  constructor(
    private readonly directory: PeerDirectoryCapabilities,
    private readonly socketDelivery: PeerSocketDelivery
  ) {}

  registerPServerTransport(transport: PServerPeerTransport): void {
    this.pserverTransport = transport;
  }

  isPServerConnected(): boolean {
    return this.pserverTransport?.isConnected() ?? false;
  }

  isConnected(peer: PeerId, toInstanceId?: string): boolean {
    if (peer === 'aab') return true;
    if (peer === 'pserver') return this.pserverTransport?.isConnected() ?? false;
    if (peer === 'eserver') return this.directory.has(peer, toInstanceId);
    return this.directory.has(peer);
  }

  validateDestination(message: IncomingPeerMessage): void {
    if (message.to === 'eserver' && !message.toInstanceId && this.directory.listInstances('eserver').length > 1) {
      throw new PeerMessageError('AMBIGUOUS_DESTINATION', 'Multiple EServer instances connected; toInstanceId is required');
    }
  }

  async deliver(message: PeerMessage): Promise<void> {
    if (message.to === 'pserver') {
      const transport = this.pserverTransport;
      if (!transport?.isConnected()) throw new Error('PServer is offline');
      await transport.deliver(message);
    } else if (message.to !== 'aab') {
      let identity: PeerIdentity | undefined;
      if (message.to === 'eserver') {
        if (message.toInstanceId) identity = this.directory.lookup('eserver', message.toInstanceId);
        else {
          const instances = this.directory.listInstances('eserver');
          if (instances.length === 1) identity = instances[0];
        }
      } else {
        identity = this.directory.lookup(message.to);
      }
      if (!identity) throw new Error(`Destination ${message.to} is offline`);
      await this.socketDelivery.deliver(message.to, identity.connectionId, message);
    }
    console.log(`[AAB] FORWARD id=${message.id} from=${message.from} sourceInstance=${message.sourceInstanceId ?? '-'} to=${message.to} toInstance=${message.toInstanceId ?? '-'} type=${message.payload.type}`);
  }
}
