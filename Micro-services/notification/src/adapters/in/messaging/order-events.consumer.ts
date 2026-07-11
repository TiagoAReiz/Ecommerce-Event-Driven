import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { NOTIFICATION_EVENT_SERVICE } from '../../../core/interfaces/services/notification-event.service.interface';
import type {
  INotificationEventService,
  OrderCancelledPayload,
  OrderCreatedPayload,
} from '../../../core/interfaces/services/notification-event.service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'order-events';

// Consome `order-events`: `OrderCreated` e `OrderCancelled` disparam e-mail. `OrderReadyForPayment`
// não interessa ao notification-service e é ignorado silenciosamente.
@Injectable()
export class OrderEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(NOTIFICATION_EVENT_SERVICE) private readonly eventService: INotificationEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'OrderCreated':
        await this.eventService.handleOrderCreated(
          envelope.eventId,
          envelope.payload as OrderCreatedPayload,
        );
        return;
      case 'OrderCancelled':
        await this.eventService.handleOrderCancelled(
          envelope.eventId,
          envelope.payload as OrderCancelledPayload,
        );
        return;
      default:
        return;
    }
  }
}
