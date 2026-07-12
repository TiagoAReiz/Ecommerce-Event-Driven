// Contrato do Kafka message value (ver docs/superpowers/specs/2026-07-08-api-endpoints-and-events-design.md,
// seção "Catálogo de eventos"). Tipo puro, sem dependência de framework — usado pelos adapters de
// entrada (adapters/in/messaging) para desserializar e rotear por `eventType`.
export interface EventEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  version: number;
  payload: TPayload;
}
