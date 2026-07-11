export const PAYMENT_WEBHOOK_SERVICE = Symbol('PAYMENT_WEBHOOK_SERVICE');

// Contrato do corpo do webhook do Mercado Pago (versão stubada). No MP real chegaria só um ponteiro
// (`data.id`) e o serviço buscaria o recurso de pagamento na API; aqui o corpo já traz tudo que
// precisamos pra decidir a coreografia, de forma determinística e testável.
export interface MercadoPagoWebhookBody {
  id: string; // mpEventId (idempotência do webhook)
  type: string; // ex: "payment"
  action?: string; // ex: "payment.updated"
  data: { id: string }; // mpPaymentId
  orderId: string; // external_reference -> nosso Payment.orderId
  status: 'approved' | 'rejected';
  method?: string; // PaymentMethod escolhido no checkout (stub: PIX)
}

export interface WebhookHandlingResult {
  status: 'confirmed' | 'failed' | 'duplicate' | 'ignored';
}

export interface IPaymentWebhookService {
  /** Valida a assinatura (401 se inválida), grava MpWebhookEvent (dedupe) e publica o evento MP. */
  handleWebhook(
    rawBody: string,
    signature: string | undefined,
    body: MercadoPagoWebhookBody,
  ): Promise<WebhookHandlingResult>;
}
