export interface CartItemProps {
  id: string;
  cartId: string;
  variantId: string;
  sellerId: string;
  quantity: number;
  unitPriceSnapshot: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CartItem {
  readonly id: string;
  readonly cartId: string;
  readonly variantId: string;
  readonly sellerId: string;
  readonly quantity: number;
  readonly unitPriceSnapshot: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CartItemProps) {
    this.id = props.id;
    this.cartId = props.cartId;
    this.variantId = props.variantId;
    this.sellerId = props.sellerId;
    this.quantity = props.quantity;
    this.unitPriceSnapshot = props.unitPriceSnapshot;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
