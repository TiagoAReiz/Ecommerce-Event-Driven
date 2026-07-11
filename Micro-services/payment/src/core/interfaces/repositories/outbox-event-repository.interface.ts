import { OutboxEvent } from '../../entities/outbox-event.entity';

export const OUTBOX_EVENT_REPOSITORY = Symbol('OUTBOX_EVENT_REPOSITORY');

export interface IOutboxEventRepository {
  /** Retorna até `limit` eventos PENDING, mais antigos primeiro. */
  findPending(limit: number): Promise<OutboxEvent[]>;
  /** Marca o evento como PUBLISHED com publishedAt = agora. */
  markPublished(id: string): Promise<void>;
}
