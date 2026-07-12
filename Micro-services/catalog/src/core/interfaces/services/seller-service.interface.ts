import { Seller } from '../../entities/seller.entity';

export const SELLER_SERVICE = Symbol('SELLER_SERVICE');

export interface OnboardSellerInput {
  storeName: string;
  document: string;
  mpCollectorId: string;
}

export interface UpdateSellerInput {
  storeName?: string;
  mpCollectorId?: string;
}

export interface ISellerService {
  /** Self-onboarding: creates the Seller as ACTIVE and publishes SellerOnboarded. */
  onboard(userId: string, input: OnboardSellerInput): Promise<Seller>;
  /** Public storefront lookup by seller id. */
  getPublic(sellerId: string): Promise<Seller>;
  /** Ownership-scoped: the seller owned by the given userId. */
  getMe(userId: string): Promise<Seller>;
  updateMe(userId: string, input: UpdateSellerInput): Promise<Seller>;
}
