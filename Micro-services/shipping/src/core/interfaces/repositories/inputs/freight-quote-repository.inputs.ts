import { CreateOutboxEventInput } from './outbox-event.input';

export interface CreateFreightQuoteData {
  id: string;
  subOrderId: string;
  originCep: string;
  destinationCep: string;
  carrier: string;
  /** string fixed-2 (Prisma aceita string em coluna Decimal). */
  price: string;
  estimatedDays: number;
  addressId: string;
}

// Escrita atômica ao reagir a `OrderCreated`: persiste as FreightQuotes das SubOrders cotadas com
// sucesso + os eventos de outbox (FreightQuoted por sucesso, FreightQuoteFailed por falha) + o
// ProcessedEvent (inbox) numa única transação. Dedupe por eventId.
export interface PersistQuotesInput {
  quotes: CreateFreightQuoteData[];
  outboxEvents: CreateOutboxEventInput[];
}
