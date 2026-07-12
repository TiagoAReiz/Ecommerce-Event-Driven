// Forma de escrita de um OutboxEvent, compartilhada pelos repositórios que gravam evento junto do
// agregado na mesma transação (createWithEvent / updateWithOptionalEvent).
export interface CreateOutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}
