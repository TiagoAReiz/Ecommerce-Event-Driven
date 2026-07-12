export const SHIPPING_EVENT_SERVICE = Symbol('SHIPPING_EVENT_SERVICE');

// Payloads consumidos (ver spec de endpoints, seção "Catálogo de eventos").

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

export interface PaymentConfirmedSplit {
  subOrderId: string;
  sellerId: string;
  amount: number;
  platformFeeAmount: number;
}

export interface PaymentConfirmedPayload {
  paymentId: string;
  orderId: string;
  userId: string;
  method: string;
  totalAmount: number;
  splits: PaymentConfirmedSplit[];
}

export interface IShippingEventService {
  /** Reage a `OrderCreated`: cotação OFICIAL por SubOrder, persiste FreightQuote, publica FreightQuoted/Failed. */
  handleOrderCreated(eventId: string, payload: OrderCreatedPayload): Promise<void>;
  /** Reage a `PaymentConfirmed`: cria o Shipment de cada SubOrder usando FreightQuote.addressId. */
  handlePaymentConfirmed(eventId: string, payload: PaymentConfirmedPayload): Promise<void>;
}
