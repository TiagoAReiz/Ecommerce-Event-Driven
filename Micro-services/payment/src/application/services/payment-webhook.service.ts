import { Inject, Injectable, Logger } from '@nestjs/common';
import { PAYMENT_REPOSITORY } from '../../core/interfaces/repositories/payment-repository.interface';
import type { IPaymentRepository } from '../../core/interfaces/repositories/payment-repository.interface';
import { MERCADO_PAGO_GATEWAY } from '../../core/interfaces/external/mercado-pago.interface';
import type { IMercadoPagoGateway } from '../../core/interfaces/external/mercado-pago.interface';
import {
  IPaymentWebhookService,
  MercadoPagoWebhookBody,
  WebhookHandlingResult,
} from '../../core/interfaces/services/payment-webhook-service.interface';
import { InvalidWebhookSignatureException } from '../../core/exceptions/invalid-webhook-signature.exception';
import { PaymentMethod } from '../../core/entities/payment.entity';

const VALID_METHODS: PaymentMethod[] = ['CREDIT_CARD', 'PIX', 'BOLETO'];

@Injectable()
export class PaymentWebhookService implements IPaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepository: IPaymentRepository,
    @Inject(MERCADO_PAGO_GATEWAY) private readonly mercadoPago: IMercadoPagoGateway,
  ) {}

  async handleWebhook(
    rawBody: string,
    signature: string | undefined,
    body: MercadoPagoWebhookBody,
  ): Promise<WebhookHandlingResult> {
    // 1) Autenticação por assinatura (não JWT). Assinatura inválida -> 401.
    if (!this.mercadoPago.verifyWebhookSignature({ rawBody, signature })) {
      throw new InvalidWebhookSignatureException();
    }

    const method = this.normalizeMethod(body.method);

    // 2) Escreve MpWebhookEvent (dedupe) + transiciona Payment + insere outbox, tudo atômico.
    if (body.status === 'approved') {
      const result = await this.paymentRepository.confirmFromWebhook({
        mpEventId: body.id,
        type: body.type,
        rawPayload: body,
        orderId: body.orderId,
        mpPaymentId: body.data.id,
        method,
      });
      return { status: result.published ? 'confirmed' : 'duplicate' };
    }

    if (body.status === 'rejected') {
      const result = await this.paymentRepository.failFromWebhook({
        mpEventId: body.id,
        type: body.type,
        rawPayload: body,
        orderId: body.orderId,
        mpPaymentId: body.data.id,
        method,
        reason: 'Payment rejected by Mercado Pago',
      });
      return { status: result.published ? 'failed' : 'duplicate' };
    }

    this.logger.warn(`Webhook ${body.id} with unhandled status "${body.status}" — ignored`);
    return { status: 'ignored' };
  }

  private normalizeMethod(raw: string | undefined): PaymentMethod {
    return raw && (VALID_METHODS as string[]).includes(raw) ? (raw as PaymentMethod) : 'PIX';
  }
}
