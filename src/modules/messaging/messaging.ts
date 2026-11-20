import type { MessagePublisher, NewMessage, MessageEnvelope } from '../../shared/contracts/message.js';
/** Narrow application capability used by transport entrypoints. */
export interface MessageSender {
  execute(message: NewMessage): Promise<MessageEnvelope>;
}
/** Application use case; consumers never depend on Express or Socket.IO. */
export class SendMessage implements MessageSender {
  constructor(private readonly publisher: MessagePublisher) {}
  execute(message: NewMessage): Promise<MessageEnvelope> { return this.publisher.publish(message); }
}
