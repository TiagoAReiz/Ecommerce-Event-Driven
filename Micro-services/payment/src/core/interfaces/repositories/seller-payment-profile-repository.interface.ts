import { SellerPaymentProfile } from '../../entities/seller-payment-profile.entity';
import { UpsertSellerPaymentProfileInput } from './inputs/seller-payment-profile-repository.inputs';

export const SELLER_PAYMENT_PROFILE_REPOSITORY = Symbol('SELLER_PAYMENT_PROFILE_REPOSITORY');

export interface ISellerPaymentProfileRepository {
  findBySellerId(sellerId: string): Promise<SellerPaymentProfile | null>;
  /** Resolve os sellers de um usuário (ownership do `GET /payments/splits`). */
  findByUserId(userId: string): Promise<SellerPaymentProfile[]>;
  /** Upsert do read-model alimentado por `SellerOnboarded`, com dedupe de inbox (ProcessedEvent). */
  upsertWithInbox(
    eventId: string,
    eventType: string,
    input: UpsertSellerPaymentProfileInput,
  ): Promise<boolean>;
}
