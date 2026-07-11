import { PaymentSplitStatus } from '../../../core/entities/payment.entity';

export interface SellerSplitResponseDto {
  id: string;
  paymentId: string;
  orderId: string;
  subOrderId: string;
  sellerId: string;
  amount: string;
  platformFeeAmount: string;
  status: PaymentSplitStatus;
  createdAt: string;
}

export interface ListSellerSplitsResponseDto {
  items: SellerSplitResponseDto[];
}
