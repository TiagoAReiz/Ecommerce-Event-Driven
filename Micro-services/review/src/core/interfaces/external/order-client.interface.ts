export const ORDER_CLIENT = Symbol('ORDER_CLIENT');

export type PurchaseVerification = { eligible: true; sellerId: string } | { eligible: false };

/**
 * Port pro order-service. Único jeito do review-service saber se o customer autenticado
 * realmente comprou `productId` em `orderId` — repassa o JWT do usuário atual, mesmo padrão de
 * cart/catalog nos outros serviços.
 */
export interface IOrderClient {
  /**
   * `GET /orders/:orderId/verify-purchase?productId=`. Só uma resposta HTTP 200 conta como
   * verificação real; qualquer outro status (403/404 etc.) é tratado como `{ eligible: false }`
   * (falha fechada). Erro de rede/timeout lança `OrderServiceUnavailableException`.
   */
  verifyPurchase(accessToken: string, orderId: string, productId: string): Promise<PurchaseVerification>;
}
