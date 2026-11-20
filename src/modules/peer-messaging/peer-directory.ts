import type { ClientPeerId } from './contracts.js';

export type DirectoryPeerId = Exclude<ClientPeerId, 'pserver'>;

export interface PeerIdentity {
  readonly peerId: DirectoryPeerId;
  readonly connectionId: string;
  readonly instanceId?: string;
}

export class DuplicatePeerIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicatePeerIdentityError';
  }
}

/** Transport-independent ownership of logical peer identity and presence. */
export class PeerDirectory {
  private readonly singlePeers = new Map<'sserver' | 'aaui', PeerIdentity>();
  private readonly eservers = new Map<string, PeerIdentity>();

  register(peerId: DirectoryPeerId, connectionId: string, requestedInstanceId?: string): PeerIdentity {
    if (peerId === 'eserver') {
      const instanceId = requestedInstanceId ?? 'default';
      if (this.eservers.has(instanceId)) throw new DuplicatePeerIdentityError('EServer instance already connected');
      const identity = { peerId, instanceId, connectionId };
      this.eservers.set(instanceId, identity);
      return identity;
    }
    if (this.singlePeers.has(peerId)) throw new DuplicatePeerIdentityError('peer already connected');
    const identity = { peerId, connectionId };
    this.singlePeers.set(peerId, identity);
    return identity;
  }

  remove(identity: PeerIdentity): boolean {
    if (identity.peerId === 'eserver') {
      if (!identity.instanceId || this.eservers.get(identity.instanceId)?.connectionId !== identity.connectionId) return false;
      return this.eservers.delete(identity.instanceId);
    }
    if (this.singlePeers.get(identity.peerId)?.connectionId !== identity.connectionId) return false;
    return this.singlePeers.delete(identity.peerId);
  }

  lookup(peerId: DirectoryPeerId, instanceId?: string): PeerIdentity | undefined {
    if (peerId === 'eserver') return instanceId === undefined
      ? (this.eservers.size === 1 ? this.eservers.values().next().value : undefined)
      : this.eservers.get(instanceId);
    return this.singlePeers.get(peerId);
  }

  lookupConnection(connectionId: string): PeerIdentity | undefined {
    for (const identity of this.eservers.values()) if (identity.connectionId === connectionId) return identity;
    for (const identity of this.singlePeers.values()) if (identity.connectionId === connectionId) return identity;
    return undefined;
  }

  listInstances(peerId: 'eserver'): PeerIdentity[] {
    return [...this.eservers.values()];
  }

  has(peerId: DirectoryPeerId, instanceId?: string): boolean {
    return this.lookup(peerId, instanceId) !== undefined || (peerId === 'eserver' && instanceId === undefined && this.eservers.size > 0);
  }

  presenceSnapshot(): { peerId: 'eserver'; timestamp: number; instances: Array<{ peerId: 'eserver'; instanceId: string; status: 'online'; socketId: string; timestamp: number }> } {
    return {
      peerId: 'eserver',
      timestamp: Date.now(),
      instances: [...this.eservers.values()].flatMap(identity => identity.instanceId ? [{
        peerId: 'eserver' as const,
        instanceId: identity.instanceId,
        status: 'online' as const,
        socketId: identity.connectionId,
        timestamp: Date.now()
      }] : [])
    };
  }
}
