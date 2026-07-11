export type SubOrderStatus =
  | 'PENDING'
  | 'READY'
  | 'PAYMENT_CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface SubOrderProps {
  id: string;
  orderId: string;
  sellerId: string;
  status: SubOrderStatus;
  subtotalAmount: string;
  shippingAmount: string | null;
  stockReservedAt: Date | null;
  freightQuotedAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class SubOrder {
  readonly id: string;
  readonly orderId: string;
  readonly sellerId: string;
  readonly status: SubOrderStatus;
  readonly subtotalAmount: string;
  readonly shippingAmount: string | null;
  readonly stockReservedAt: Date | null;
  readonly freightQuotedAt: Date | null;
  readonly cancelReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SubOrderProps) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.sellerId = props.sellerId;
    this.status = props.status;
    this.subtotalAmount = props.subtotalAmount;
    this.shippingAmount = props.shippingAmount;
    this.stockReservedAt = props.stockReservedAt;
    this.freightQuotedAt = props.freightQuotedAt;
    this.cancelReason = props.cancelReason;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Pronta pra virar READY assim que os dois carimbos (estoque + frete) estiverem setados. */
  get hasBothResolutions(): boolean {
    return this.stockReservedAt !== null && this.freightQuotedAt !== null;
  }

  get isTerminal(): boolean {
    return this.status === 'CANCELLED' || this.status === 'REFUNDED' || this.status === 'DELIVERED';
  }
}
