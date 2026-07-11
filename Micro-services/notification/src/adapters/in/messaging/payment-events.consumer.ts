import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { NOTIFICATION_EVENT_SERVICE } from '../../../core/interfaces/services/notification-event.service.interface';
import type {
  INotificationEventService,
  PaymentConfirmedPayload,
  PaymentFailedPayload,
  PaymentRefundedPayload,
} from '../../../core/interfaces/services/notification-event.service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'payment-events';

// Consome `payment-events`: `PaymentConfirmed`, `PaymentFailed` e `PaymentRefunded` disparam e-mail.
@Injectable()
export class PaymentEventsConsumer implements OnModuleInit {
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
      case 'PaymentRefunded':
        await this.eventService.handlePaymentRefunded(
          envelope.eventId,
          envelope.payload as PaymentRefundedPayload,
        );
        return;
      default:
        return;
    }
  }
}
