// Forma de escrita do read-model SellerPaymentProfile (upsert idempotente via inbox, alimentado
// por SellerOnboarded).
export interface UpsertSellerPaymentProfileInput {
  sellerId: string;
  userId: string;
  mpCollectorId: string;
}
