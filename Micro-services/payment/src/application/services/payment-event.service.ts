import { Inject, Injectable, Logger } from '@nestjs/common';
import { PAYMENT_REPOSITORY } from '../../core/interfaces/repositories/payment-repository.interface';
import type {
  CreatePaymentSplitData,
  IPaymentRepository,
} from '../../core/interfaces/repositories/payment-repository.interface';
import { SELLER_PAYMENT_PROFILE_REPOSITORY } from '../../core/interfaces/repositories/seller-payment-profile-repository.interface';
import type { ISellerPaymentProfileRepository } from '../../core/interfaces/repositories/seller-payment-profile-repository.interface';
import { MERCADO_PAGO_GATEWAY } from '../../core/interfaces/external/mercado-pago.interface';
import type {
  CreatePreferenceSplitInput,
  IMercadoPagoGateway,
} from '../../core/interfaces/external/mercado-pago.interface';
import {
  IPaymentEventService,
  OrderCancelledPayload,
  OrderReadyForPaymentPayload,
  SellerOnboardedPayload,
} from '../../core/interfaces/services/payment-event-service.interface';
import { SellerPaymentProfileNotFoundException } from '../../core/exceptions/seller-payment-profile-not-found.exception';
import { PaymentMethod } from '../../core/entities/payment.entity';
import { computeSplit } from '../split-calculator';

// Método default no momento da criação da preferência: o cliente só escolhe o meio de pagamento no
// checkout do MP, que aqui é stubado. O webhook (também stubado) reafirma o método. Em produção viria
// do recurso de pagamento do MP.
const DEFAULT_METHOD: PaymentMethod = 'PIX';

@Injectable()
export class PaymentEventService implements IPaymentEventService {
  private readonly logger = new Logger(PaymentEventService.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepository: IPaymentRepository,
    @Inject(SELLER_PAYMENT_PROFILE_REPOSITORY)
    private readonly profileRepository: ISellerPaymentProfileRepository,
    @Inject(MERCADO_PAGO_GATEWAY) private readonly mercadoPago: IMercadoPagoGateway,
  ) {}

  // `OrderReadyForPayment` -> cria Payment PENDING + preferência MP com split por seller. Não publica
  // nada (a coreografia só emite PaymentConfirmed/Failed a partir do webhook do MP).
  async handleOrderReadyForPayment(
    eventId: string,
    payload: OrderReadyForPaymentPayload,
  ): Promise<void> {
    // Resolve mpCollectorId de cada seller e calcula o split. Se o perfil ainda não existe (o
    // SellerOnboarded não chegou), lança -> a transação nem começa e o evento é reprocessado depois.
    const splits: CreatePaymentSplitData[] = [];
    const preferenceSplits: CreatePreferenceSplitInput[] = [];

    for (const subOrder of payload.subOrders) {
      const profile = await this.profileRepository.findBySellerId(subOrder.sellerId);
      if (!profile) {
        throw new SellerPaymentProfileNotFoundException(subOrder.sellerId);
      }
      const { amount, platformFeeAmount } = computeSplit(
        subOrder.subtotalAmount,
        subOrder.shippingAmount,
      );
      splits.push({
        subOrderId: subOrder.subOrderId,
        sellerId: subOrder.sellerId,
        mpCollectorId: profile.mpCollectorId,
        amount,
        platformFeeAmount,
      });
      preferenceSplits.push({
        subOrderId: subOrder.subOrderId,
        sellerId: subOrder.sellerId,
        mpCollectorId: profile.mpCollectorId,
        amount,
        platformFeeAmount,
      });
    }

    // Preferência é determinística (stub) — segura de recalcular em redelivery. O dedupe de inbox
    // ainda garante que só criamos o Payment uma vez.
    const preference = await this.mercadoPago.createPreference({
      orderId: payload.orderId,
      userId: payload.userId,
      totalAmount: payload.totalAmount,
      splits: preferenceSplits,
    });

    const payment = await this.paymentRepository.createPaymentWithSplits(eventId, 'OrderReadyForPayment', {
      orderId: payload.orderId,
      userId: payload.userId,
      method: DEFAULT_METHOD,
      totalAmount: payload.totalAmount,
      mpPreferenceId: preference.preferenceId,
      splits,
    });

    if (!payment) {
      this.logger.log(`OrderReadyForPayment ${eventId} already processed (redelivery) — no-op`);
    }
  }

  // `OrderCancelled` -> refund se o Payment estava APPROVED (idempotente/no-op caso contrário),
  // publica PaymentRefunded. O refund em si acontece dentro da transação do repositório.
  async handleOrderCancelled(eventId: string, payload: OrderCancelledPayload): Promise<void> {
    const result = await this.paymentRepository.refundOnCancel(
      eventId,
      'OrderCancelled',
      payload.orderId,
      (mpPaymentId) => this.mercadoPago.refund(mpPaymentId),
    );

    if (result.alreadyProcessed) {
      this.logger.log(`OrderCancelled ${eventId} already processed (redelivery) — no-op`);
    } else if (result.refunded) {
      this.logger.log(`Refunded payment for order ${payload.orderId} on cancellation`);
    } else {
      this.logger.log(`OrderCancelled ${payload.orderId}: nothing to refund (not APPROVED) — no-op`);
    }
  }

  // `SellerOnboarded` -> popula/atualiza o read-model SellerPaymentProfile (inclui userId, usado na
  // autorização por ownership do GET /payments/splits).
  async handleSellerOnboarded(eventId: string, payload: SellerOnboardedPayload): Promise<void> {
    await this.profileRepository.upsertWithInbox(eventId, 'SellerOnboarded', {
      sellerId: payload.sellerId,
      userId: payload.userId,
      mpCollectorId: payload.mpCollectorId,
    });
  }
}
