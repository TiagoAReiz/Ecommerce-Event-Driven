import { CartItemResponseDto } from './cart-item-response.dto';

export class CartResponseDto {
  id!: string;
  userId!: string;
  items!: CartItemResponseDto[];
  createdAt!: Date;
  updatedAt!: Date;
}
