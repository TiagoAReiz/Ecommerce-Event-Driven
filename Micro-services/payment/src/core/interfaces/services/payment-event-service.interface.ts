// Shapes de payload conforme o "Catálogo de eventos" do spec
// (docs/superpowers/specs/2026-07-08-api-endpoints-and-events-design.md). Valores monetários chegam
// como string fixed-2.

export const PAYMENT_EVENT_SERVICE = Symbol('PAYMENT_EVENT_SERVICE');

export interface OrderReadyForPaymentSubOrder {
  subOrderId: string;
  sellerId: string;
  subtotalAmount: string;
  shippingAmount: string;
  status: string;
}

export interface OrderReadyForPaymentPayload {
  orderId: string;
  userId: string;
  totalAmount: string;
  subOrders: OrderReadyForPaymentSubOrder[];
}

export interface OrderCancelledPayload {
  orderId: string;
  userId: string;
  subOrderIds: string[];
  cancelReason: string;
  initiatedBy: 'CUSTOMER' | 'SYSTEM';
}

export interface SellerOnboardedPayload {
  sellerId: string;
  userId: string;
  storeName: string;
  document: string;
  mpCollectorId: string;
}

// Um método por eventType consumido. O roteamento por eventType acontece no adapter de entrada
// (adapters/in/messaging/*.consumer.ts), que ignora silenciosamente eventTypes não listados aqui.
export interface IPaymentEventService {
  handleOrderReadyForPayment(eventId: string, payload: OrderReadyForPaymentPayload): Promise<void>;
  handleOrderCancelled(eventId: string, payload: OrderCancelledPayload): Promise<void>;
  handleSellerOnboarded(eventId: string, payload: SellerOnboardedPayload): Promise<void>;
}
