export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';

export interface StockReservationProps {
  id: string;
  variantId: string;
  subOrderId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class StockReservation {
  readonly id: string;
  readonly variantId: string;
  readonly subOrderId: string;
  readonly quantity: number;
  readonly status: ReservationStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: StockReservationProps) {
    this.id = props.id;
    this.variantId = props.variantId;
    this.subOrderId = props.subOrderId;
    this.quantity = props.quantity;
    this.status = props.status;
    this.expiresAt = props.expiresAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
