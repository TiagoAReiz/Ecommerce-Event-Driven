export interface OrderItemProps {
  id: string;
  subOrderId: string;
  variantId: string;
  skuSnapshot: string;
  titleSnapshot: string;
  unitPriceSnapshot: string;
  quantity: number;
  weightGramsSnapshot: number;
  createdAt: Date;
}

export class OrderItem {
  readonly id: string;
  readonly subOrderId: string;
  readonly variantId: string;
  readonly skuSnapshot: string;
  readonly titleSnapshot: string;
  readonly unitPriceSnapshot: string;
  readonly quantity: number;
  readonly weightGramsSnapshot: number;
  readonly createdAt: Date;

  constructor(props: OrderItemProps) {
    this.id = props.id;
    this.subOrderId = props.subOrderId;
    this.variantId = props.variantId;
    this.skuSnapshot = props.skuSnapshot;
    this.titleSnapshot = props.titleSnapshot;
    this.unitPriceSnapshot = props.unitPriceSnapshot;
    this.quantity = props.quantity;
    this.weightGramsSnapshot = props.weightGramsSnapshot;
    this.createdAt = props.createdAt;
  }
}
