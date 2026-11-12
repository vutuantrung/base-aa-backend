import { z } from 'zod';

export const peerIds = ['aab', 'pserver', 'eserver', 'sserver', 'aaui'] as const;
export const clientPeerIds = ['pserver', 'eserver', 'sserver', 'aaui'] as const;
export type PeerId = typeof peerIds[number];
export type ClientPeerId = typeof clientPeerIds[number];

const jsonData = z.unknown().refine(value => value !== undefined, 'payload.data is required');
export const incomingPeerMessageSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.literal('1.0').default('1.0'),
  kind: z.enum(['request', 'response', 'event']),
  from: z.enum(clientPeerIds),
  to: z.enum(peerIds),
  toInstanceId: z.string().trim().min(1).max(100).optional(),
  channel: z.string().min(1).max(100).default('worker'),
  event: z.literal('message').default('message'),
  correlationId: z.string().min(1).max(200).optional(),
  causationId: z.string().min(1).max(200).optional(),
  payload: z.object({
    type: z.string().trim().min(1).max(150),
    version: z.string().trim().min(1).max(30).default('1.0'),
    data: jsonData
  }).strict()
}).strict();
export type IncomingPeerMessage = z.infer<typeof incomingPeerMessageSchema>;

export type PeerMessage = IncomingPeerMessage & {
  /** Authenticated source instance, assigned by AAB (not trusted from payload). */
  sourceInstanceId?: string;
  id: string;
  timestamp: number;
  processing?: {
    transformed: boolean;
    processedBy: string[];
    timestamp: number;
  };
};

export type PeerMessageAck =
  | { ok: true; data: PeerMessage }
  | { ok: false; error: string; code: 'INVALID_MESSAGE' | 'SENDER_MISMATCH' | 'DESTINATION_OFFLINE' | 'TRANSFORMATION_FAILED' | 'DELIVERY_FAILED' | 'UNSUPPORTED_DESTINATION' | 'AMBIGUOUS_DESTINATION' };
