import { Payment, PaymentMethod, PaymentSplitStatus } from '../../entities/payment.entity';
import { CreatePaymentData } from './inputs/payment-repository.inputs';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface WebhookConfirmData {
  mpEventId: string;
  type: string;
  rawPayload: unknown;
  orderId: string;
  mpPaymentId: string;
  method: PaymentMethod;
}

export interface WebhookFailData extends WebhookConfirmData {
  reason: string;
}

export interface WebhookResult {
  /** false quando o mpEventId era duplicado (redelivery) ou o Payment não estava PENDING. */
  published: boolean;
}

export interface RefundOnCancelResult {
  /** true quando um refund + outbox PaymentRefunded foram criados nesta chamada. */
  refunded: boolean;
  alreadyProcessed: boolean;
}

// Projeção de split para o `GET /payments/splits` (inclui orderId, que mora no Payment pai).
export interface SellerSplitView {
  id: string;
  paymentId: string;
  orderId: string;
  subOrderId: string;
  sellerId: string;
  amount: string;
  platformFeeAmount: string;
  status: PaymentSplitStatus;
  createdAt: Date;
}

export interface IPaymentRepository {
  findByOrderId(orderId: string): Promise<Payment | null>;

  /** Splits dos sellers informados, mais recentes primeiro (usado pelo endpoint de repasses). */
  findSplitsBySellerIds(sellerIds: string[]): Promise<SellerSplitView[]>;

  /**
   * Reativo a `OrderReadyForPayment`: cria o Payment PENDING + splits + registro de inbox numa única
   * transação. NÃO grava outbox (a coreografia publica PaymentConfirmed/Failed só a partir do webhook
   * do MP). Retorna `null` se o eventId já foi processado (redelivery).
   */
  createPaymentWithSplits(
    eventId: string,
    eventType: string,
    data: CreatePaymentData,
  ): Promise<Payment | null>;

  /**
   * Webhook aprovado: grava MpWebhookEvent (dedupe por mpEventId único), promove o Payment a APPROVED,
   * marca splits SETTLED e insere o outbox `PaymentConfirmed` — tudo atômico. `published=false` em
   * redelivery ou se o Payment não estava PENDING.
   */
  confirmFromWebhook(data: WebhookConfirmData): Promise<WebhookResult>;

  /** Webhook rejeitado: idem acima, mas Payment -> REJECTED e outbox `PaymentFailed`. */
  failFromWebhook(data: WebhookFailData): Promise<WebhookResult>;

  /**
   * Reativo a `OrderCancelled`: dedupe por eventId + guarda de status. Se o Payment está APPROVED,
   * chama `refundFn` (gateway MP) DENTRO da transação, promove o Payment a REFUNDED e insere o outbox
   * `PaymentRefunded`. Se não estava pago (ou já REFUNDED), é no-op idempotente. O refund dispara uma
   * única vez mesmo que o evento liste vários subOrderIds.
   */
  refundOnCancel(
    eventId: string,
    eventType: string,
    orderId: string,
    refundFn: (mpPaymentId: string) => Promise<{ refundId: string }>,
  ): Promise<RefundOnCancelResult>;
}
