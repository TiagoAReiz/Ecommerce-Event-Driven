import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { STOCK_EVENT_SERVICE } from '../../../core/interfaces/services/stock-event-service.interface';
import type {
  IStockEventService,
  PaymentConfirmedPayload,
  PaymentFailedPayload,
} from '../../../core/interfaces/services/stock-event-service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'payment-events';

// Consome `payment-events`: `PaymentConfirmed` → confirma a baixa; `PaymentFailed` → libera.
// `PaymentRefunded` não interessa ao inventory e é ignorado silenciosamente.
@Injectable()
export class PaymentEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(STOCK_EVENT_SERVICE) private readonly eventService: IStockEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'PaymentConfirmed':
        await this.eventService.handlePaymentConfirmed(
          envelope.eventId,
          envelope.payload as PaymentConfirmedPayload,
        );
        return;
      case 'PaymentFailed':
        await this.eventService.handlePaymentFailed(
          envelope.eventId,
          envelope.payload as PaymentFailedPayload,
        );
        return;
      default:
        return;
    }
  }
}
