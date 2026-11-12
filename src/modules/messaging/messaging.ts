import type { MessagePublisher, NewMessage, MessageEnvelope } from '../../shared/contracts/message.js';
/** Application use case; consumers never depend on Express or Socket.IO. */
export class SendMessage {
  constructor(private readonly publisher: MessagePublisher) {}
  execute(message: NewMessage): Promise<MessageEnvelope> { return this.publisher.publish(message); }
}
