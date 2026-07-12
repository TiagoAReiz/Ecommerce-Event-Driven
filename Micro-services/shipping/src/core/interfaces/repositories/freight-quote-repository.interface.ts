import { FreightQuote } from '../../entities/freight-quote.entity';

export const FREIGHT_QUOTE_REPOSITORY = Symbol('FREIGHT_QUOTE_REPOSITORY');

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

export interface CreateOutboxEventInput {
  id?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}

// Escrita atômica ao reagir a `OrderCreated`: persiste as FreightQuotes das SubOrders cotadas com
// sucesso + os eventos de outbox (FreightQuoted por sucesso, FreightQuoteFailed por falha) + o
// ProcessedEvent (inbox) numa única transação. Dedupe por eventId.
export interface PersistQuotesInput {
  quotes: CreateFreightQuoteData[];
  outboxEvents: CreateOutboxEventInput[];
}

export interface IFreightQuoteRepository {
  findBySubOrderId(subOrderId: string): Promise<FreightQuote | null>;
  /**
   * Transação: se `eventId` já foi processado, no-op e retorna `false`. Senão, grava quotes +
   * outbox + ProcessedEvent atomicamente e retorna `true`.
   */
  persistQuotesWithInbox(
    eventId: string,
    eventType: string,
    input: PersistQuotesInput,
  ): Promise<boolean>;
}
