import { OrderItemResponseDto } from './order-item-response.dto';

export class SubOrderResponseDto {
  id!: string;
  orderId!: string;
  sellerId!: string;
  status!: string;
  subtotalAmount!: string;
  shippingAmount!: string | null;
  cancelReason!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  items?: OrderItemResponseDto[];
}
