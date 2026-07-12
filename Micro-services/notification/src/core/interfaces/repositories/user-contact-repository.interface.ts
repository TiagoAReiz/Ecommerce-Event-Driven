import { UserContact } from '../../entities/user-contact.entity';

export const USER_CONTACT_REPOSITORY = Symbol('USER_CONTACT_REPOSITORY');

export interface UpsertUserContactInput {
  userId: string;
  email: string;
  name: string;
}

export interface IUserContactRepository {
  findByUserId(userId: string): Promise<UserContact | null>;

  // Idempotente via inbox: dedupe-check de `eventId` (ProcessedEvent) + upsert do contato, tudo
  // na mesma transação. Retorna `false` se o eventId já tinha sido processado (no-op).
  upsertWithInbox(eventId: string, eventType: string, input: UpsertUserContactInput): Promise<boolean>;
}
