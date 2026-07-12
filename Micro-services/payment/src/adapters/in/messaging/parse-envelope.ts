import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';
import { EventEnvelope } from '../../../core/entities/event-envelope.entity';

const logger = new Logger('KafkaEnvelopeParser');

// JSON.parse do envelope Kafka (contrato: { eventId, eventType, aggregateType, aggregateId,
// occurredAt, version, payload }). Retorna `null` (loga e ignora) em vez de propagar em caso de
// mensagem malformada — malformação não é um erro de negócio reentregável, é lixo de mensagem.
export function parseEnvelope<TPayload = unknown>(
  message: KafkaJS.EachMessagePayload,
): EventEnvelope<TPayload> | null {
  const raw = message.message.value?.toString();
  if (!raw) {
    logger.warn(`Empty message value on topic ${message.topic}`);
    return null;
  }

  try {
    return JSON.parse(raw) as EventEnvelope<TPayload>;
  } catch (error) {
    logger.error(`Failed to parse envelope on topic ${message.topic}`, error as Error);
    return null;
  }
}
