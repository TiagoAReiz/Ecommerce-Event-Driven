// Forma de escrita do read-model SellerProfile (upsert idempotente via inbox, alimentado por
// SellerOnboarded).
export interface UpsertSellerProfileInput {
  sellerId: string;
  userId: string;
}
