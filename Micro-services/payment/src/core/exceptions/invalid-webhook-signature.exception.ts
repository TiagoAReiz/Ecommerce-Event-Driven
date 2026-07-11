import { DomainException } from './domain.exception';

// Webhook do Mercado Pago é autenticado por assinatura (não JWT). Assinatura inválida -> 401.
export class InvalidWebhookSignatureException extends DomainException {
  constructor() {
    super('Invalid Mercado Pago webhook signature');
  }
}
