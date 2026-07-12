import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_REPOSITORY } from '../../core/interfaces/repositories/payment-repository.interface';
import type {
  IPaymentRepository,
  SellerSplitView,
} from '../../core/interfaces/repositories/payment-repository.interface';
import { SELLER_PAYMENT_PROFILE_REPOSITORY } from '../../core/interfaces/repositories/seller-payment-profile-repository.interface';
import type { ISellerPaymentProfileRepository } from '../../core/interfaces/repositories/seller-payment-profile-repository.interface';
import { MERCADO_PAGO_GATEWAY } from '../../core/interfaces/external/mercado-pago.interface';
import type { IMercadoPagoGateway } from '../../core/interfaces/external/mercado-pago.interface';
import {
  IPaymentQueryService,
  PaymentWithInitPoint,
} from '../../core/interfaces/services/payment-query-service.interface';
import { PaymentNotFoundException } from '../../core/exceptions/payment-not-found.exception';
import { ForbiddenPaymentAccessException } from '../../core/exceptions/forbidden-payment-access.exception';

@Injectable()
export class PaymentQueryService implements IPaymentQueryService {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepository: IPaymentRepository,
    @Inject(SELLER_PAYMENT_PROFILE_REPOSITORY)
    private readonly profileRepository: ISellerPaymentProfileRepository,
    @Inject(MERCADO_PAGO_GATEWAY) private readonly mercadoPago: IMercadoPagoGateway,
  ) {}

  async getByOrderId(userId: string, orderId: string): Promise<PaymentWithInitPoint> {
    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment) {
      throw new PaymentNotFoundException();
    }
    // Ownership: o Payment tem que ser do usuário do token (o cliente que fez o pedido).
    if (payment.userId !== userId) {
      throw new ForbiddenPaymentAccessException();
    }
    const initPoint = payment.mpPreferenceId
      ? this.mercadoPago.buildInitPoint(payment.mpPreferenceId)
      : null;
    return { payment, initPoint };
  }

  async getSplitsForUser(userId: string): Promise<SellerSplitView[]> {
    // Ownership de seller resolvida no banco local: userId (JWT) -> sellers -> splits. Se o usuário
    // não é seller (sem perfil), a lista é vazia.
    const profiles = await this.profileRepository.findByUserId(userId);
    const sellerIds = profiles.map((p) => p.sellerId);
    return this.paymentRepository.findSplitsBySellerIds(sellerIds);
  }
}
