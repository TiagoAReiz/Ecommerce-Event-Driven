import { DomainException } from './domain.exception';

// Lançada quando `OrderReadyForPayment` chega antes do `SellerOnboarded` do respectivo seller ter
// populado o read-model `SellerPaymentProfile` (sem `mpCollectorId` não dá pra montar o split). É
// tratada como erro reentregável no consumer: a transação faz rollback e o evento é reprocessado
// depois — quando o perfil já existir.
export class SellerPaymentProfileNotFoundException extends DomainException {
  constructor(sellerId: string) {
    super(`SellerPaymentProfile not found for seller ${sellerId}`);
  }
}
