import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CreatePreferenceInput,
  CreatePreferenceResult,
  IMercadoPagoGateway,
  RefundResult,
  VerifyWebhookSignatureInput,
} from '../../../core/interfaces/external/mercado-pago.interface';

// =============================================================================================
// STUB DETERMINÍSTICO do Mercado Pago — NÃO integra a API real (fora de escopo desta fase).
// Toda a lógica é pura/determinística pra ser testável e reproduzível:
//   - createPreference: preferenceId derivado do orderId; init_point derivado do preferenceId.
//   - verifyWebhookSignature: HMAC-SHA256 do corpo cru com MP_WEBHOOK_SECRET (mesmo segredo dos dois
//     lados). No MP real seria a validação `x-signature`/`ts` do webhook.
//   - refund: devolve um refundId determinístico, sem chamada externa.
// Trocar por um adapter real (SDK do MP) é só implementar a mesma port em outro provider.
// =============================================================================================
@Injectable()
export class StubMercadoPagoGateway implements IMercadoPagoGateway {
  private readonly logger = new Logger(StubMercadoPagoGateway.name);

  private get webhookSecret(): string {
    return process.env.MP_WEBHOOK_SECRET ?? 'dev-mp-webhook-secret-change-me';
  }

  async createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult> {
    const preferenceId = `mp-pref-${input.orderId}`;
    this.logger.log(
      `[STUB] createPreference order=${input.orderId} total=${input.totalAmount} splits=${input.splits.length}`,
    );
    return { preferenceId, initPoint: this.buildInitPoint(preferenceId) };
  }

  buildInitPoint(preferenceId: string): string {
    // Link de checkout fake, derivado do preferenceId (determinístico, sem coluna extra no schema).
    return `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${preferenceId}`;
  }

  verifyWebhookSignature(input: VerifyWebhookSignatureInput): boolean {
    if (!input.signature) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(input.rawBody).digest('hex');
    const provided = input.signature;
    // Comparação em tempo constante; comprimentos diferentes -> inválido sem lançar.
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }

  async refund(mpPaymentId: string): Promise<RefundResult> {
    this.logger.log(`[STUB] refund payment=${mpPaymentId}`);
    return { refundId: `mp-refund-${mpPaymentId}` };
  }
}
