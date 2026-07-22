import { SellerProfile } from '../../entities/seller-profile.entity';
import { UpsertSellerProfileInput } from './inputs/seller-profile-repository.inputs';

export const SELLER_PROFILE_REPOSITORY = Symbol('SELLER_PROFILE_REPOSITORY');

export interface ISellerProfileRepository {
  findBySellerId(sellerId: string): Promise<SellerProfile | null>;

  // Idempotente via inbox: dedupe-check de `eventId` (ProcessedEvent) + upsert do profile, tudo
  // na mesma transação. Retorna `false` se o eventId já tinha sido processado (no-op).
  upsertWithInbox(eventId: string, eventType: string, input: UpsertSellerProfileInput): Promise<boolean>;
}
