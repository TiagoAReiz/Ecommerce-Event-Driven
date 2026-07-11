import { CartItem } from './cart-item.entity';

export interface CartProps {
  id: string;
  userId: string;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export class Cart {
  readonly id: string;
  readonly userId: string;
  readonly items: CartItem[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CartProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.items = props.items;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
