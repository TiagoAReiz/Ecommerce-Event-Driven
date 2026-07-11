export interface StockItemProps {
  id: string;
  variantId: string;
  sellerId: string;
  quantity: number;
  reservedQty: number;
  createdAt: Date;
  updatedAt: Date;
}

export class StockItem {
  readonly id: string;
  readonly variantId: string;
  readonly sellerId: string;
  readonly quantity: number;
  readonly reservedQty: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: StockItemProps) {
    this.id = props.id;
    this.variantId = props.variantId;
    this.sellerId = props.sellerId;
    this.quantity = props.quantity;
    this.reservedQty = props.reservedQty;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Disponível para reserva/venda: total menos o que já está reservado. */
  get available(): number {
    return this.quantity - this.reservedQty;
  }
}
