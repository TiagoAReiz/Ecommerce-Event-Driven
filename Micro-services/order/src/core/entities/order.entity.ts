export type OrderStatus =
  | 'PENDING'
  | 'READY_FOR_PAYMENT'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'PARTIALLY_FULFILLED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OrderProps {
  id: string;
  userId: string;
  addressId: string;
  status: OrderStatus;
  totalAmount: string;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Order {
  readonly id: string;
  readonly userId: string;
  readonly addressId: string;
  readonly status: OrderStatus;
  readonly totalAmount: string;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: OrderProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.addressId = props.addressId;
    this.status = props.status;
    this.totalAmount = props.totalAmount;
    this.idempotencyKey = props.idempotencyKey;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
