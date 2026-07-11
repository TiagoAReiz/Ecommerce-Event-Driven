export type ProductStatus = 'ACTIVE' | 'PAUSED' | 'DELETED';

export interface ProductProps {
  id: string;
  sellerId: string;
  categoryId: string;
  title: string;
  description: string;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Product {
  readonly id: string;
  readonly sellerId: string;
  readonly categoryId: string;
  readonly title: string;
  readonly description: string;
  readonly status: ProductStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ProductProps) {
    this.id = props.id;
    this.sellerId = props.sellerId;
    this.categoryId = props.categoryId;
    this.title = props.title;
    this.description = props.description;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
