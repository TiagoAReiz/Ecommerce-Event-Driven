// Forma de escrita de um OutboxEvent, gravado na mesma transação do agregado (createWithEvent /
// promoteToSellerWithInbox).
export interface CreateOutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}
