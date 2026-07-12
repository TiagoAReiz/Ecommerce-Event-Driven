// Formas de escrita do checkout (montadas no application/services/order.service.ts). Os ids são
// gerados no caller — precisamos deles ANTES do insert pra montar o payload de OrderCreated na
// mesma transação (Prisma aceita id explícito mesmo com @default(uuid())).

export interface CreateOrderItemInput {
  variantId: string;
  sku: string;
  title: string;
  /** Money string, `.toFixed(2)`. */
  unitPrice: string;
  quantity: number;
  weightGrams: number;
}

export interface CreateSubOrderInput {
  id: string;
  sellerId: string;
  /** Soma de `unitPrice * quantity` dos itens, `.toFixed(2)`. */
  subtotalAmount: string;
  items: CreateOrderItemInput[];
}

export interface CreateOrderInput {
  id: string;
  userId: string;
  addressId: string;
  idempotencyKey: string;
  /** Soma dos subtotais dos subOrders — frete ainda não é conhecido no checkout. */
  totalAmount: string;
  subOrders: CreateSubOrderInput[];
  /**
   * Payload completo de `OrderCreated` já montado pelo caller (inclui `heightCm/widthCm/lengthCm`
   * por item — dado que o order-db NÃO persiste, só carrega no evento pro shipping cotar frete
   * real). O repositório só grava isso no outbox verbatim, na mesma transação do insert.
   */
  outboxPayload: unknown;
}
