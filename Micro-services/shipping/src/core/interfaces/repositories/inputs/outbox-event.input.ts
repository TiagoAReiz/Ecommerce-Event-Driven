// Forma de escrita de um OutboxEvent, gravado na mesma transação do efeito de negócio. `id`
// opcional: quando o caller já gera o id (pra referenciá-lo antes do insert).
export interface CreateOutboxEventInput {
  id?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}
