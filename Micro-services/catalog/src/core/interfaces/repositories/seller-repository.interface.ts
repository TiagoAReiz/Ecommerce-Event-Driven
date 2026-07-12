import { Seller } from '../../entities/seller.entity';
import { CreateSellerInput } from './inputs/seller-repository.inputs';
import { CreateOutboxEventInput } from './inputs/outbox-event.input';

export const SELLER_REPOSITORY = Symbol('SELLER_REPOSITORY');

export interface ISellerRepository {
  findById(id: string): Promise<Seller | null>;
  findByUserId(userId: string): Promise<Seller | null>;
  /** Creates the Seller row + the outbox event row in the same transaction. */
  createWithEvent(seller: CreateSellerInput, event: CreateOutboxEventInput): Promise<Seller>;
  update(id: string, data: { storeName?: string; mpCollectorId?: string }): Promise<Seller>;
}
