import { DomainException } from './domain.exception';

// Lançada no consumo de `PaymentConfirmed` quando não há `FreightQuote` para um SubOrder — sinaliza
// que o `OrderCreated` correspondente ainda não foi processado (tópicos distintos, sem ordenação
// entre si). Propaga pro consumer pra o Kafka reentregar; nada é gravado (sem ProcessedEvent), então
// o replay é seguro quando a quote já existir. (Na prática, todo split de PaymentConfirmed tem uma
// quote de sucesso — SubOrder com FreightQuoteFailed não chega a pagamento.)
export class FreightQuoteNotFoundException extends DomainException {
  constructor(subOrderId: string) {
    super(`FreightQuote not found for subOrder ${subOrderId}`);
  }
}
