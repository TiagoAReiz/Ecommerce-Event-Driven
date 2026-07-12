import { Payment } from '../../core/entities/payment.entity';
import { PaymentWithInitPoint } from '../../core/interfaces/services/payment-query-service.interface';
import { SellerSplitView } from '../../core/interfaces/repositories/payment-repository.interface';
import { PaymentResponseDto } from '../../adapters/in/dtos/payment-response.dto';
import {
  ListSellerSplitsResponseDto,
  SellerSplitResponseDto,
} from '../../adapters/in/dtos/seller-split-response.dto';

export class PaymentMapper {
  static toPaymentResponse(result: PaymentWithInitPoint): PaymentResponseDto {
    const payment: Payment = result.payment;
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      method: payment.method,
      totalAmount: payment.totalAmount,
      initPoint: result.initPoint,
      splits: payment.splits.map((s) => ({
        subOrderId: s.subOrderId,
        sellerId: s.sellerId,
        amount: s.amount,
        platformFeeAmount: s.platformFeeAmount,
        status: s.status,
      })),
    };
  }

  static toSplitResponse(view: SellerSplitView): SellerSplitResponseDto {
    return {
      id: view.id,
      paymentId: view.paymentId,
      orderId: view.orderId,
      subOrderId: view.subOrderId,
      sellerId: view.sellerId,
      amount: view.amount,
      platformFeeAmount: view.platformFeeAmount,
      status: view.status,
      createdAt: view.createdAt.toISOString(),
    };
  }

  static toSplitsListResponse(views: SellerSplitView[]): ListSellerSplitsResponseDto {
    return { items: views.map((v) => PaymentMapper.toSplitResponse(v)) };
  }
}
