import type { IncomingPeerMessage, PeerId, PeerMessage } from './contracts.js';
import { PeerMessageError, type PeerDelivery, type PeerDeliveryContext } from './peer-message-service.js';
import type { DirectoryPeerId, PeerIdentity } from './peer-directory.js';
import { ProvenUnsentDeliveryError } from '../../shared/contracts/reliable-delivery.js';

const boundEServerInstance = Symbol('bound-eserver-instance');

interface EServerDeliveryContext extends PeerDeliveryContext {
  readonly [boundEServerInstance]: true;
  readonly instanceId: string;
}

function isEServerDeliveryContext(context: PeerDeliveryContext | undefined): context is EServerDeliveryContext {
  return context !== undefined &&
    boundEServerInstance in context && context[boundEServerInstance] === true &&
    'instanceId' in context && typeof context.instanceId === 'string';
}

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

  isConnected(peer: PeerId, toInstanceId?: string, context?: PeerDeliveryContext): boolean {
    if (peer === 'aab') return true;
    if (peer === 'pserver') return this.pserverTransport?.isConnected() ?? false;
    if (peer === 'eserver') {
      const boundContext = this.asEServerContext(context);
      return boundContext
        ? this.directory.lookup('eserver', boundContext.instanceId) !== undefined
        : this.directory.has(peer, toInstanceId);
    }
    return this.directory.has(peer);
  }

  validateDestination(message: IncomingPeerMessage): void {
    if (message.to === 'eserver' && !message.toInstanceId && this.directory.listInstances('eserver').length > 1) {
      throw new PeerMessageError('AMBIGUOUS_DESTINATION', 'Multiple EServer instances connected; toInstanceId is required');
    }
  }

  bindDestination(message: IncomingPeerMessage): PeerDeliveryContext | undefined {
    if (message.to !== 'eserver') return undefined;
    if (message.toInstanceId) return { [boundEServerInstance]: true, instanceId: message.toInstanceId };
    const soleInstance = this.directory.listInstances('eserver')[0];
    if (!soleInstance) return undefined;
    if (!soleInstance.instanceId)
      throw new PeerMessageError('DESTINATION_OFFLINE', 'Destination eserver is offline');
    return { [boundEServerInstance]: true, instanceId: soleInstance.instanceId };
  }

  async deliver(message: PeerMessage, context?: PeerDeliveryContext): Promise<void> {
    if (message.to === 'pserver') {
      const transport = this.pserverTransport;
      if (!transport?.isConnected()) throw new ProvenUnsentDeliveryError('PServer is offline');
      await transport.deliver(message);
    } else if (message.to !== 'aab') {
      let identity: PeerIdentity | undefined;
      if (message.to === 'eserver') {
        const boundContext = this.asEServerContext(context);
        if (boundContext) identity = this.directory.lookup('eserver', boundContext.instanceId);
        else if (message.toInstanceId) identity = this.directory.lookup('eserver', message.toInstanceId);
        else {
          const instances = this.directory.listInstances('eserver');
          if (instances.length === 1) identity = instances[0];
        }
      } else {
        identity = this.directory.lookup(message.to);
      }
      if (!identity) {
        if (message.to === 'eserver' && this.asEServerContext(context))
          throw new PeerMessageError('DESTINATION_OFFLINE', `Destination ${message.to} is offline`);
        throw new Error(`Destination ${message.to} is offline`);
      }
      await this.socketDelivery.deliver(message.to, identity.connectionId, message);
    }
    console.log(`[AAB] FORWARD id=${message.id} from=${message.from} sourceInstance=${message.sourceInstanceId ?? '-'} to=${message.to} toInstance=${message.toInstanceId ?? '-'} type=${message.payload.type}`);
  }

  private asEServerContext(context: PeerDeliveryContext | undefined): EServerDeliveryContext | undefined {
    return isEServerDeliveryContext(context) ? context : undefined;
  }
}
