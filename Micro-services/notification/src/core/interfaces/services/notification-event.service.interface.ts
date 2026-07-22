// Shapes de payload conforme o "Catálogo de eventos" do spec
// (docs/superpowers/specs/2026-07-08-api-endpoints-and-events-design.md). Só os campos que o
// notification-service realmente usa são tipados a mais; o resto fica `unknown[]`/opaco de propósito
// — este serviço não precisa entender itens de pedido, splits de pagamento etc.

export const NOTIFICATION_EVENT_SERVICE = Symbol('NOTIFICATION_EVENT_SERVICE');

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export interface OrderCreatedPayload {
  orderId: string;
  userId: string;
  addressId: string;
  subOrders: unknown[];
}

export interface OrderCancelledPayload {
  orderId: string;
  userId: string;
  subOrderIds: string[];
  cancelReason: string;
  initiatedBy: 'CUSTOMER' | 'SYSTEM';
}

export interface PaymentConfirmedPayload {
  paymentId: string;
  orderId: string;
  userId: string;
  method: string;
  totalAmount: number;
  splits: unknown[];
}

export interface PaymentFailedPayload {
  paymentId: string;
  orderId: string;
  userId: string;
  method: string;
  reason: string;
}

export interface PaymentRefundedPayload {
  paymentId: string;
  orderId: string;
  userId: string;
  refundedAmount: number;
  splits: unknown[];
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

export interface SellerOnboardedPayload {
  sellerId: string;
  userId: string;
  storeName: string;
  document: string;
  mpCollectorId: string;
}

export interface ReviewSentPayload {
  reviewId: string;
  customerId: string;
  productId: string;
  sellerId: string;
  grade: number;
  comment: string;
  orderId: string;
}

// Um método por eventType consumido; o roteamento por eventType acontece no adapter de entrada
// (adapters/in/messaging/*-events.consumer.ts), que ignora silenciosamente eventTypes não listados
// aqui (ex.: `OrderReadyForPayment`, `UserRoleChanged`, `FreightQuoted`).
export interface INotificationEventService {
  handleUserRegistered(eventId: string, payload: UserRegisteredPayload): Promise<void>;
  handleOrderCreated(eventId: string, payload: OrderCreatedPayload): Promise<void>;
  handleOrderCancelled(eventId: string, payload: OrderCancelledPayload): Promise<void>;
  handlePaymentConfirmed(eventId: string, payload: PaymentConfirmedPayload): Promise<void>;
  handlePaymentFailed(eventId: string, payload: PaymentFailedPayload): Promise<void>;
  handlePaymentRefunded(eventId: string, payload: PaymentRefundedPayload): Promise<void>;
  handleShipmentDispatched(eventId: string, payload: ShipmentDispatchedPayload): Promise<void>;
  handleShipmentDelivered(eventId: string, payload: ShipmentDeliveredPayload): Promise<void>;
  handleSellerOnboarded(eventId: string, payload: SellerOnboardedPayload): Promise<void>;
  handleReviewSent(eventId: string, payload: ReviewSentPayload): Promise<void>;
}
