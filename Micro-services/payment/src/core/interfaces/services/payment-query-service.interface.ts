import { Payment } from '../../entities/payment.entity';
import { SellerSplitView } from '../repositories/payment-repository.interface';

export const PAYMENT_QUERY_SERVICE = Symbol('PAYMENT_QUERY_SERVICE');

export interface PaymentWithInitPoint {
  payment: Payment;
  /** Link de checkout do Mercado Pago derivado do preferenceId; null enquanto não há preferência. */
  initPoint: string | null;
}

export interface IPaymentQueryService {
  /** `GET /payments/:orderId` — 404 se não existe, 403 se o Payment não é do `userId`. */
  getByOrderId(userId: string, orderId: string): Promise<PaymentWithInitPoint>;
  /** `GET /payments/splits` — repasses dos sellers cujo `userId` é o do token. */
  getSplitsForUser(userId: string): Promise<SellerSplitView[]>;
}
