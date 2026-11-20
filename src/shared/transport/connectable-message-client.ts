import type { MessageEnvelope, NewMessage } from '../contracts/message.js';

/** Same outbound contract for calling this app through HTTP or Socket.IO. */
export interface ConnectableMessageClient {
  send(message: NewMessage): Promise<MessageEnvelope>;
  close(): Promise<void>;
}
