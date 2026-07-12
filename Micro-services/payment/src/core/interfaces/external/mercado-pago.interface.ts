export const MERCADO_PAGO_GATEWAY = Symbol('MERCADO_PAGO_GATEWAY');

// Todos os valores monetários são string fixed-2 (convenção MONEY do projeto).
export interface CreatePreferenceSplitInput {
  subOrderId: string;
  sellerId: string;
  mpCollectorId: string;
  amount: string;
  platformFeeAmount: string;
}

export interface CreatePreferenceInput {
  orderId: string;
  userId: string;
  totalAmount: string;
  splits: CreatePreferenceSplitInput[];
}

export interface CreatePreferenceResult {
  preferenceId: string;
  initPoint: string;
}

export interface VerifyWebhookSignatureInput {
  rawBody: string;
  signature: string | undefined;
}

export interface RefundResult {
  refundId: string;
}

// Port do gateway de pagamento (Mercado Pago). A implementação real fica fora de escopo desta fase:
// o adapter concreto (adapters/out/external/stub-mercado-pago.gateway.ts) é um STUB determinístico.
export interface IMercadoPagoGateway {
  /** Cria a preferência de checkout com split por seller; devolve preferenceId + init_point. */
  createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult>;
  /** Deriva o init_point (link de checkout) de forma determinística a partir do preferenceId. */
  buildInitPoint(preferenceId: string): string;
  /** Valida a assinatura do webhook (HMAC do corpo cru com o segredo compartilhado). */
  verifyWebhookSignature(input: VerifyWebhookSignatureInput): boolean;
  /** Estorna um pagamento aprovado no MP. */
  refund(mpPaymentId: string): Promise<RefundResult>;
}
