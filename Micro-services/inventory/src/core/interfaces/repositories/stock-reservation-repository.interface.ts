export const STOCK_RESERVATION_REPOSITORY = Symbol('STOCK_RESERVATION_REPOSITORY');

export type ReleaseReason = 'PAYMENT_FAILED' | 'ORDER_CANCELLED' | 'EXPIRED';

export interface ReserveItemInput {
  variantId: string;
  quantity: number;
}

export interface ReserveSubOrderInput {
  subOrderId: string;
  items: ReserveItemInput[];
}

export interface ReserveOrderInput {
  orderId: string;
  subOrders: ReserveSubOrderInput[];
}

/**
 * Todas as operações abaixo são atômicas: efeito de estoque + linhas de StockReservation +
 * inbox (ProcessedEvent, dedupe por `eventId`) + outbox de saída (OutboxEvent) na MESMA
 * `$transaction`. Idempotência de reentrega vem da tabela ProcessedEvent; idempotência de
 * dupla-liberação vem do guard por `status = PENDING`.
 */
export interface IStockReservationRepository {
  /**
   * Reage a `OrderCreated`: reserva estoque por SubOrder (all-or-nothing por SubOrder). Cada
   * SubOrder vira um `StockReserved` (sucesso) ou `StockReservationFailed` (algum item sem
   * disponível) no outbox. `reservedQty += q` (não debita `quantity`). No-op se `eventId` já
   * processado.
   */
  reserveForOrder(
    eventId: string,
    eventType: string,
    order: ReserveOrderInput,
    expiresAt: Date,
  ): Promise<void>;

  /**
   * Reage a `PaymentConfirmed`: confirma a baixa das reservas PENDING dos SubOrders informados
   * (`quantity -= q` e `reservedQty -= q`, status → CONFIRMED). Sem evento de saída. No-op se
   * `eventId` já processado ou se as reservas não estão mais PENDING.
   */
  confirmForSubOrders(eventId: string, eventType: string, subOrderIds: string[]): Promise<void>;

  /**
   * Libera as reservas PENDING dos SubOrders informados (`reservedQty -= q`, status → RELEASED)
   * e publica um `StockReleased` por SubOrder que teve ao menos um item liberado. No-op se
   * `eventId` já processado; SubOrder sem reserva PENDING não gera evento (idempotente com
   * OrderCancelled/PaymentFailed concorrentes).
   */
  releaseSubOrders(
    eventId: string,
    eventType: string,
    subOrderIds: string[],
    reason: ReleaseReason,
  ): Promise<void>;

  /**
   * Recupera os subOrderIds de um pedido a partir dos `StockReserved` já persistidos no outbox
   * (aggregateId = subOrderId, filtrando por `payload.orderId`). Necessário porque o payload de
   * `PaymentFailed` só carrega `orderId` e o schema (congelado) de StockReservation não tem
   * coluna `orderId`. Funciona porque OutboxEvents nunca são deletados, só marcados PUBLISHED.
   */
  findReservedSubOrderIdsByOrderId(orderId: string): Promise<string[]>;

  /**
   * Job de TTL: libera reservas ainda PENDING vencidas (`expiresAt < now`), agrupa por SubOrder
   * e publica um `StockReleased` reason EXPIRED por SubOrder. Não usa inbox (é timer, não
   * evento). Retorna quantas reservas foram efetivamente expiradas.
   */
  expireDueReservations(now: Date): Promise<number>;
}
