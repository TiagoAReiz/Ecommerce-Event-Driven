export type ShipmentStatus =
  | 'LABEL_PENDING'
  | 'LABEL_CREATED'
  | 'POSTED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'RETURNED';

export interface ShipmentProps {
  id: string;
  subOrderId: string;
  orderId: string;
  userId: string;
  addressId: string;
  carrier: string;
  trackingCode: string | null;
  status: ShipmentStatus;
  estimatedDeliveryDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Shipment {
  readonly id: string;
  readonly subOrderId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly addressId: string;
  readonly carrier: string;
  readonly trackingCode: string | null;
  readonly status: ShipmentStatus;
  readonly estimatedDeliveryDate: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ShipmentProps) {
    this.id = props.id;
    this.subOrderId = props.subOrderId;
    this.orderId = props.orderId;
    this.userId = props.userId;
    this.addressId = props.addressId;
    this.carrier = props.carrier;
    this.trackingCode = props.trackingCode;
    this.status = props.status;
    this.estimatedDeliveryDate = props.estimatedDeliveryDate;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
