import { DomainException } from './domain.exception';

// Regra do spec: cancelamento é bloqueado depois que QUALQUER subOrder chega em SHIPPED
// (ou além, DELIVERED) — a partir daí o pacote já saiu, não dá pra desfazer via saga.
export class OrderCancellationBlockedException extends DomainException {
  constructor() {
    super('Order cannot be cancelled after a subOrder has shipped');
  }
}
