import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { NOTIFICATION_EVENT_SERVICE } from '../../../core/interfaces/services/notification-event.service.interface';
import type {
  INotificationEventService,
  ReviewSentPayload,
} from '../../../core/interfaces/services/notification-event.service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'review-events';

// Consome `review-events`: `ReviewSent` dispara o e-mail pro seller (nome do customer, nota,
// comentário). Não há outros eventTypes nesse tópico hoje.
@Injectable()
export class ReviewEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(NOTIFICATION_EVENT_SERVICE) private readonly eventService: INotificationEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope<ReviewSentPayload>(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'ReviewSent':
        await this.eventService.handleReviewSent(envelope.eventId, envelope.payload);
        return;
      default:
        return;
    }
  }
}
