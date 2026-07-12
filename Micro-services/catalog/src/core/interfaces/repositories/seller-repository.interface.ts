import { Seller, SellerStatus } from '../../entities/seller.entity';

export const SELLER_REPOSITORY = Symbol('SELLER_REPOSITORY');

export interface CreateSellerInput {
  id: string;
  userId: string;
  storeName: string;
  slug: string;
  document: string;
  mpCollectorId: string;
  status: SellerStatus;
}

export interface CreateOutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}

export interface ISellerRepository {
  findById(id: string): Promise<Seller | null>;
  findByUserId(userId: string): Promise<Seller | null>;
  /** Creates the Seller row + the outbox event row in the same transaction. */
  createWithEvent(seller: CreateSellerInput, event: CreateOutboxEventInput): Promise<Seller>;
  update(id: string, data: { storeName?: string; mpCollectorId?: string }): Promise<Seller>;
}
