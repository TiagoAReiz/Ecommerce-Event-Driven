// Formas de escrita das operações de reserva (montadas a partir do payload de OrderCreated).
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
