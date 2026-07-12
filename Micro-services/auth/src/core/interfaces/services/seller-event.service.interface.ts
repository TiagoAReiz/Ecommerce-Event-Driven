export const SELLER_EVENT_SERVICE = Symbol('SELLER_EVENT_SERVICE');

// Payload do evento `SellerOnboarded` publicado pelo catalog-service em `catalog-events`
// (ver spec, seção catalog-events). auth só usa `userId` — os demais campos são ignorados.
export interface SellerOnboardedPayload {
  sellerId: string;
  userId: string;
  storeName: string;
  document: string;
  mpCollectorId: string;
}

// Serviço que reage a eventos do catalog relativos a seller onboarding. Implementado em
// application/services e chamado pelo consumer em adapters/in/messaging.
export interface ISellerEventService {
  handleSellerOnboarded(eventId: string, payload: SellerOnboardedPayload): Promise<void>;
}
