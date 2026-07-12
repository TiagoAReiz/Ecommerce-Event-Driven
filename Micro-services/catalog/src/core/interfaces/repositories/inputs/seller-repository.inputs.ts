import { SellerStatus } from '../../../entities/seller.entity';

// Forma de escrita pra criar um Seller (id/slug gerados no service).
export interface CreateSellerInput {
  id: string;
  userId: string;
  storeName: string;
  slug: string;
  document: string;
  mpCollectorId: string;
  status: SellerStatus;
}
