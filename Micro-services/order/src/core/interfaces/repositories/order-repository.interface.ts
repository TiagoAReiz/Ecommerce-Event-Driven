import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { SubOrder, SubOrderStatus } from '../../entities/sub-order.entity';
import { CreateOrderInput } from './inputs/order-repository.inputs';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface SubOrderWithItems {
  subOrder: SubOrder;
  items: OrderItem[];
}

export interface OrderWithSubOrders {
  order: Order;
  subOrders: SubOrderWithItems[];
}

export interface ListFilter {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

export type ReleaseReason = 'PAYMENT_FAILED' | 'ORDER_CANCELLED' | 'EXPIRED';
export type CancelInitiator = 'CUSTOMER' | 'SYSTEM';

/**
 * Todas as operações de escrita são atômicas: efeito de estado (Order/SubOrder) + inbox
 * (ProcessedEvent, dedupe por `eventId`, nos métodos reativos a evento) + outbox de saída
 * (OutboxEvent) na MESMA `$transaction` — mesmo padrão do inventory-service
 * (stock-reservation.repository.ts).
 *
 * **Exactly-once de `OrderReadyForPayment`:** a transição Order.status PENDING ->
 * READY_FOR_PAYMENT usa um `updateMany({ where: { id, status: 'PENDING' } })` e só publica o
 * evento se `count === 1`. Isso é o mesmo guard condicional usado no confirm/release do
 * inventory — protege contra duas SubOrders concorrentes completando por último e ambas
 * tentando fechar o Order. A checagem "SubOrder ficou pronta" (stockReservedAt E
 * freightQuotedAt setados) roda dentro da mesma transação que seta o carimbo, então o lock de
 * linha do Postgres serializa `recordStockReserved`/`recordFreightQuoted` concorrentes pro
 * mesmo SubOrder — quem roda por último enxerga o carimbo do outro já committado.
 */
export interface IOrderRepository {
  /** Lookup de replay: `Order` já criado com essa (userId, idempotencyKey). */
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<OrderWithSubOrders | null>;

  /**
   * Cria Order+SubOrders+OrderItems+outbox(`OrderCreated`) numa transação. Se uma transação
   * concorrente já inseriu a mesma (userId, idempotencyKey) — violação da constraint única —,
   * NÃO propaga o erro: recupera o Order existente e retorna `created: false`. O caller usa
   * `created` só pra decidir se deve publicar efeitos colaterais extras (não há nenhum hoje,
   * mas mantém a distinção explícita em vez de silenciar).
   */
  createOrder(input: CreateOrderInput): Promise<{ order: OrderWithSubOrders; created: boolean }>;

  findById(orderId: string): Promise<OrderWithSubOrders | null>;

  findManyByUser(userId: string, filter: ListFilter): Promise<PaginatedResult<Order>>;

  findSubOrderById(subOrderId: string): Promise<SubOrderWithItems | null>;

  findManyBySeller(
    sellerId: string,
    filter: ListFilter & { status?: SubOrderStatus },
  ): Promise<PaginatedResult<SubOrder>>;

  /**
   * Cancelamento via `POST /orders/:id/cancel` (sem inbox — não é reação a evento Kafka).
   * Atômico: lê os SubOrders dentro da transação; se algum já está SHIPPED ou DELIVERED,
   * aborta sem escrever nada (`blocked: true`). Senão, marca Order e todo SubOrder não-terminal
   * como CANCELLED e grava `OrderCancelled` no outbox com os subOrderIds afetados. No-op
   * (`cancelled: false`) se o Order já estava CANCELLED (idempotente a retry do cliente).
   */
  cancelOrder(
    orderId: string,
    cancelReason: string,
    initiatedBy: CancelInitiator,
  ): Promise<{ cancelled: boolean; blocked: boolean; subOrderIds: string[] }>;

  /**
   * Mesma operação de cancelamento, mas disparada como compensação a um evento de falha
   * (`StockReservationFailed`, `FreightQuoteFailed`, `PaymentFailed`) — com inbox (dedupe por
   * `eventId`). `initiatedBy` é sempre `SYSTEM`. Não bloqueia por SHIPPED (compensação roda
   * cedo na saga, antes de qualquer Shipment existir) mas herda a mesma checagem por segurança.
   */
  cancelOrderForEvent(
    eventId: string,
    eventType: string,
    orderId: string,
    cancelReason: string,
  ): Promise<void>;

  // --- inventory-events ---

  /**
   * Reage a `StockReserved`: seta `SubOrder.stockReservedAt = now` (no-op se já setado).
   * Se o SubOrder ficou com os dois carimbos (stock + frete), tenta virar READY e então
   * checa se TODOS os SubOrders do Order estão READY — se sim, fecha o Order (ver docstring
   * da interface sobre exactly-once). Idempotente por `eventId`.
   */
  recordStockReserved(eventId: string, eventType: string, subOrderId: string, orderId: string): Promise<void>;

  /**
   * Reage a `StockReservationFailed`: dispara compensação do Order inteiro (mesmo caminho de
   * `cancelOrderForEvent`) — falha em QUALQUER SubOrder cancela o pedido todo, pra que
   * `OrderCancelled` alcance o inventory e libere SubOrders que já tinham reservado com
   * sucesso. Idempotente por `eventId`.
   */
  recordStockReservationFailed(
    eventId: string,
    eventType: string,
    subOrderId: string,
    orderId: string,
    reason: string,
  ): Promise<void>;

  /**
   * Reage a `StockReleased`. O payload NÃO carrega `orderId` (só `subOrderId`) — resolvido
   * internamente via `SubOrder.orderId`. Quando `reason = 'EXPIRED'` (job de TTL do inventory
   * liberou uma reserva que nunca foi confirmada), compensa cancelando o Order (mesmo caminho
   * de `cancelOrderForEvent`) se ainda não estiver num estado terminal. Para
   * `PAYMENT_FAILED`/`ORDER_CANCELLED` é apenas confirmação de algo que o próprio order-service
   * já iniciou — no-op (evita re-cancelar em loop). Idempotente por `eventId`.
   */
  recordStockReleased(
    eventId: string,
    eventType: string,
    subOrderId: string,
    reason: ReleaseReason,
  ): Promise<void>;

  /**
   * Reage a `FreightQuoted`: seta `freightQuotedAt = now` e `shippingAmount`. Mesma lógica de
   * fechamento de SubOrder/Order de `recordStockReserved`. Idempotente por `eventId`.
   */
  recordFreightQuoted(
    eventId: string,
    eventType: string,
    subOrderId: string,
    orderId: string,
    shippingAmount: string,
  ): Promise<void>;

  /** Reage a `FreightQuoteFailed`: mesma compensação de `recordStockReservationFailed`. */
  recordFreightQuoteFailed(
    eventId: string,
    eventType: string,
    subOrderId: string,
    orderId: string,
    reason: string,
  ): Promise<void>;

  // --- payment-events ---

  /**
   * Reage a `PaymentConfirmed`: marca `Order.status = PAID` e `SubOrder.status =
   * PAYMENT_CONFIRMED` pros subOrders informados (splits do evento). Idempotente por `eventId`.
   */
  recordPaymentConfirmed(
    eventId: string,
    eventType: string,
    orderId: string,
    subOrderIds: string[],
  ): Promise<void>;

  /**
   * Reage a `PaymentFailed`: compensação do Order inteiro (mesmo caminho de
   * `cancelOrderForEvent`) — o pagamento falhou, então não faz sentido manter o pedido
   * aguardando; o cliente refaz o checkout do zero. Idempotente por `eventId`.
   */
  recordPaymentFailed(eventId: string, eventType: string, orderId: string, reason: string): Promise<void>;

  /** Reage a `PaymentRefunded`: marca `SubOrder.status = REFUNDED` pros subOrders do split. */
  recordPaymentRefunded(eventId: string, eventType: string, subOrderIds: string[]): Promise<void>;

  // --- shipping-events (status do envio) ---

  /** Reage a `ShipmentDispatched`: `SubOrder.status = SHIPPED` (guard: só a partir de PAYMENT_CONFIRMED/PROCESSING). */
  recordShipmentDispatched(eventId: string, eventType: string, subOrderId: string): Promise<void>;

  /**
   * Reage a `ShipmentDelivered`: `SubOrder.status = DELIVERED`. Se TODOS os SubOrders do Order
   * ficarem DELIVERED, marca `Order.status = COMPLETED`.
   */
  recordShipmentDelivered(eventId: string, eventType: string, subOrderId: string): Promise<void>;
}
