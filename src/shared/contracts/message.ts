export const CHANNELS = ['session', 'worker'] as const;
export type Channel = (typeof CHANNELS)[number];
export type MessageEnvelope = {
  id: string;
  channel: Channel;
  event: string;
  payload: unknown;
  timestamp: string;
  correlationId?: string;
  origin?: 'http' | 'socket' | 'internal';
};
export type NewMessage = Pick<MessageEnvelope, 'channel' | 'event' | 'payload'> & { correlationId?: string };
export interface MessagePublisher {
  publish(message: NewMessage): Promise<MessageEnvelope>;
}
export interface MessageConsumer {
  subscribe(channel: Channel, handler: (message: MessageEnvelope) => void | Promise<void>): () => void;
}
