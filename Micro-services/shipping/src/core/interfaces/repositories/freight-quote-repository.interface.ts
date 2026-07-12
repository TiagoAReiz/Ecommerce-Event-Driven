import { FreightQuote } from '../../entities/freight-quote.entity';
import { PersistQuotesInput } from './inputs/freight-quote-repository.inputs';

export const FREIGHT_QUOTE_REPOSITORY = Symbol('FREIGHT_QUOTE_REPOSITORY');

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
