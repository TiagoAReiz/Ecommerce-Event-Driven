import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { NOTIFICATION_EVENT_SERVICE } from '../../../core/interfaces/services/notification-event.service.interface';
import type {
  INotificationEventService,
  ShipmentDeliveredPayload,
  ShipmentDispatchedPayload,
} from '../../../core/interfaces/services/notification-event.service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'shipping-events';

// Consome `shipping-events`: `ShipmentDispatched` e `ShipmentDelivered` disparam e-mail.
// `FreightQuoted`/`FreightQuoteFailed` são ignorados silenciosamente (não é assunto de e-mail).
@Injectable()
export class ShippingEventsConsumer implements OnModuleInit {
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
      case 'ShipmentDispatched':
        await this.eventService.handleShipmentDispatched(
          envelope.eventId,
          envelope.payload as ShipmentDispatchedPayload,
        );
        return;
      case 'ShipmentDelivered':
        await this.eventService.handleShipmentDelivered(
          envelope.eventId,
          envelope.payload as ShipmentDeliveredPayload,
        );
        return;
      default:
        return;
    }
  }
}
