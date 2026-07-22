import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { NOTIFICATION_EVENT_SERVICE } from '../../../core/interfaces/services/notification-event.service.interface';
import type {
  INotificationEventService,
  SellerOnboardedPayload,
} from '../../../core/interfaces/services/notification-event.service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'catalog-events';

// Consome `catalog-events`: só `SellerOnboarded` interessa ao notification-service (alimenta o
// read-model SellerProfile, usado pra resolver o e-mail do seller no consumo de ReviewSent).
@Injectable()
export class CatalogEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(NOTIFICATION_EVENT_SERVICE) private readonly eventService: INotificationEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope<SellerOnboardedPayload>(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'SellerOnboarded':
        await this.eventService.handleSellerOnboarded(envelope.eventId, envelope.payload);
        return;
      default:
        return;
    }
  }
}
