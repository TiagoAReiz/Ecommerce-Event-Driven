import { PaymentMethod, PaymentSplitStatus, PaymentStatus } from '../../../core/entities/payment.entity';

export interface PaymentSplitResponseDto {
  subOrderId: string;
  sellerId: string;
  amount: string;
  platformFeeAmount: string;
  status: PaymentSplitStatus;
}

export interface PaymentResponseDto {
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
  method: PaymentMethod;
  totalAmount: string;
  initPoint: string | null;
  splits: PaymentSplitResponseDto[];
}
