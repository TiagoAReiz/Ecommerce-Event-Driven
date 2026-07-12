import { DomainException } from './domain.exception';

// Lançada quando um evento de negócio (OrderCreated, PaymentConfirmed etc.) chega pra um userId
// sem UserContact resolvido ainda — normalmente uma corrida com o `UserRegistered` que ainda não
// foi processado. Deixe propagar: a transação de inbox faz rollback (ProcessedEvent não é criado)
// e o Kafka reentrega a mensagem depois.
export class UserContactNotFoundException extends DomainException {
  constructor(userId: string) {
    super(`UserContact not found for userId ${userId}`);
  }
}
