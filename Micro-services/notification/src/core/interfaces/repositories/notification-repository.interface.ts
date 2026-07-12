import { Notification } from '../../entities/notification.entity';
import { CreatePendingNotificationInput } from './inputs/notification-repository.inputs';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface INotificationRepository {
  // Idempotente via inbox: dedupe-check de `eventId` (ProcessedEvent) + grava NotificationLog
  // PENDING, tudo na mesma transação. Retorna `null` se o eventId já tinha sido processado (no-op).
  createPendingWithInbox(
    eventId: string,
    eventType: string,
    input: CreatePendingNotificationInput,
  ): Promise<Notification | null>;

  // Side-effect externo (envio de e-mail) roda DEPOIS do commit da transação acima — estes dois
  // métodos gravam o resultado fora de transação.
  markSent(id: string, sentAt: Date): Promise<void>;
  markFailed(id: string): Promise<void>;

  listByUser(userId: string, page: number, limit: number): Promise<PaginatedResult<Notification>>;
}
