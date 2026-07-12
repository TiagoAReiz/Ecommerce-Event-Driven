import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { PAYMENT_EVENT_SERVICE } from '../../../core/interfaces/services/payment-event-service.interface';
import type {
  IPaymentEventService,
  OrderCancelledPayload,
  OrderReadyForPaymentPayload,
} from '../../../core/interfaces/services/payment-event-service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'order-events';

// Consome `order-events`: `OrderReadyForPayment` (cria Payment + preferência MP) e `OrderCancelled`
// (refund se pago). `OrderCreated` não interessa ao payment-service e é ignorado silenciosamente.
@Injectable()
export class OrderEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(PAYMENT_EVENT_SERVICE) private readonly eventService: IPaymentEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'OrderReadyForPayment':
        await this.eventService.handleOrderReadyForPayment(
          envelope.eventId,
          envelope.payload as OrderReadyForPaymentPayload,
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
