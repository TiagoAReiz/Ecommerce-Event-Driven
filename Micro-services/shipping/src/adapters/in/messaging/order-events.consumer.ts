import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { SHIPPING_EVENT_SERVICE } from '../../../core/interfaces/services/shipping-event-service.interface';
import type {
  IShippingEventService,
  OrderCreatedPayload,
} from '../../../core/interfaces/services/shipping-event-service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'order-events';

// Consome `order-events`: só `OrderCreated` interessa ao shipping (cotação oficial de frete). Os
// demais (`OrderReadyForPayment`, `OrderCancelled`) são ignorados silenciosamente — o escopo deste
// serviço não reage a eles.
@Injectable()
export class OrderEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(SHIPPING_EVENT_SERVICE) private readonly eventService: IShippingEventService,
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
      default:
        return;
    }
  }
}
