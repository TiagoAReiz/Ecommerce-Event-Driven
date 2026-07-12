export const ORDER_EVENT_SERVICE = Symbol('ORDER_EVENT_SERVICE');

// --- Payloads consumidos (ver spec, seção "Catálogo de eventos") ---

// inventory-events

export interface StockReservationItem {
  variantId: string;
  quantity: number;
  reservationId: string;
}

export interface StockReservedPayload {
  subOrderId: string;
  orderId: string;
  reservations: StockReservationItem[];
}

export interface StockReservationFailedItem {
  variantId: string;
  requestedQty: number;
  availableQty: number;
}

export interface StockReservationFailedPayload {
  subOrderId: string;
  orderId: string;
  failedItems: StockReservationFailedItem[];
}

export type StockReleaseReason = 'PAYMENT_FAILED' | 'ORDER_CANCELLED' | 'EXPIRED';

export interface StockReleasedPayload {
  subOrderId: string;
  releasedItems: { variantId: string; quantity: number }[];
  reason: StockReleaseReason;
}

// shipping-events

export interface FreightQuotedPayload {
  subOrderId: string;
  orderId: string;
  carrier: string;
  /** Money string, `.toFixed(2)`. */
  price: string;
  estimatedDays: number;
}

export interface FreightQuoteFailedPayload {
  subOrderId: string;
  orderId: string;
  reason: string;
}

export interface ShipmentDispatchedPayload {
  subOrderId: string;
  orderId: string;
  userId: string;
  trackingCode: string;
  carrier: string;
  estimatedDeliveryDate: string;
}

export interface ShipmentDeliveredPayload {
  subOrderId: string;
  orderId: string;
  userId: string;
  deliveredAt: string;
}

// payment-events

export interface PaymentConfirmedSplit {
  subOrderId: string;
  sellerId: string;
  amount: string;
  platformFeeAmount: string;
}

export interface PaymentConfirmedPayload {
  paymentId: string;
  orderId: string;
  userId: string;
  method: string;
  totalAmount: string;
  splits: PaymentConfirmedSplit[];
}

export interface PaymentFailedPayload {
  paymentId: string;
  orderId: string;
  userId: string;
  method: string;
  reason: string;
}

export interface PaymentRefundedSplit {
  subOrderId: string;
  sellerId: string;
  amount: string;
}

export interface PaymentRefundedPayload {
  paymentId: string;
  orderId: string;
  userId: string;
  refundedAmount: string;
  splits: PaymentRefundedSplit[];
}

/**
 * Agregação central da saga: por SubOrder espera AMBOS `StockReserved` E `FreightQuoted`;
 * quando todos os SubOrders de um Order resolverem positivo, publica `OrderReadyForPayment`
 * (ver order-repository.interface.ts pro detalhe do guard exactly-once). Falhas
 * (`StockReservationFailed`/`FreightQuoteFailed`/`PaymentFailed`) compensam o Order inteiro.
 */
export interface IOrderEventService {
  handleStockReserved(eventId: string, payload: StockReservedPayload): Promise<void>;
  handleStockReservationFailed(eventId: string, payload: StockReservationFailedPayload): Promise<void>;
  handleStockReleased(eventId: string, payload: StockReleasedPayload): Promise<void>;

  handleFreightQuoted(eventId: string, payload: FreightQuotedPayload): Promise<void>;
  handleFreightQuoteFailed(eventId: string, payload: FreightQuoteFailedPayload): Promise<void>;
  handleShipmentDispatched(eventId: string, payload: ShipmentDispatchedPayload): Promise<void>;
  handleShipmentDelivered(eventId: string, payload: ShipmentDeliveredPayload): Promise<void>;

  handlePaymentConfirmed(eventId: string, payload: PaymentConfirmedPayload): Promise<void>;
  handlePaymentFailed(eventId: string, payload: PaymentFailedPayload): Promise<void>;
  handlePaymentRefunded(eventId: string, payload: PaymentRefundedPayload): Promise<void>;
}
