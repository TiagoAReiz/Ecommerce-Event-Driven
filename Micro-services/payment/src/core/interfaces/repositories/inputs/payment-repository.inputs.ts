import { PaymentMethod } from '../../../entities/payment.entity';

// Formas de escrita pra criar a Payment + seus splits (reativo a OrderReadyForPayment). Money em
// string `.toFixed(2)`.
export interface CreatePaymentSplitData {
  subOrderId: string;
  sellerId: string;
  mpCollectorId: string;
  amount: string;
  platformFeeAmount: string;
}

export interface CreatePaymentData {
  orderId: string;
  userId: string;
  method: PaymentMethod;
  totalAmount: string;
  mpPreferenceId: string;
  splits: CreatePaymentSplitData[];
}
