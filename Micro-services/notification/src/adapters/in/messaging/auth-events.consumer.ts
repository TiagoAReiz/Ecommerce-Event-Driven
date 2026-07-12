import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { NOTIFICATION_EVENT_SERVICE } from '../../../core/interfaces/services/notification-event.service.interface';
import type {
  INotificationEventService,
  UserRegisteredPayload,
} from '../../../core/interfaces/services/notification-event.service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'auth-events';

// Consome `auth-events`: só `UserRegistered` interessa ao notification-service (alimenta o
// read-model UserContact). `UserRoleChanged` é ignorado silenciosamente.
@Injectable()
export class AuthEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(NOTIFICATION_EVENT_SERVICE) private readonly eventService: INotificationEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope<UserRegisteredPayload>(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'UserRegistered':
        await this.eventService.handleUserRegistered(envelope.eventId, envelope.payload);
        return;
      default:
        return;
    }
  }
}
