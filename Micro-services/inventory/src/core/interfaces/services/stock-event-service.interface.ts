export const STOCK_EVENT_SERVICE = Symbol('STOCK_EVENT_SERVICE');

// --- Payloads consumidos (ver spec, seção "Catálogo de eventos") ---

export interface OrderCreatedItem {
  variantId: string;
  sku: string;
  quantity: number;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

export interface OrderCreatedSubOrder {
  subOrderId: string;
  sellerId: string;
  items: OrderCreatedItem[];
}

export interface OrderCreatedPayload {
  orderId: string;
  userId: string;
  addressId: string;
  subOrders: OrderCreatedSubOrder[];
}

export interface OrderCancelledPayload {
  orderId: string;
  userId: string;
  subOrderIds: string[];
  cancelReason: string;
  initiatedBy: 'CUSTOMER' | 'SYSTEM';
}

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

export interface IStockEventService {
  handleOrderCreated(eventId: string, payload: OrderCreatedPayload): Promise<void>;
  handleOrderCancelled(eventId: string, payload: OrderCancelledPayload): Promise<void>;
  handlePaymentConfirmed(eventId: string, payload: PaymentConfirmedPayload): Promise<void>;
  handlePaymentFailed(eventId: string, payload: PaymentFailedPayload): Promise<void>;
}
