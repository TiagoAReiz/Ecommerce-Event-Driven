import { SubOrderResponseDto } from './sub-order-response.dto';

export class OrderResponseDto {
  id!: string;
  userId!: string;
  addressId!: string;
  status!: string;
  totalAmount!: string;
  createdAt!: Date;
  updatedAt!: Date;
  subOrders?: SubOrderResponseDto[];
}
