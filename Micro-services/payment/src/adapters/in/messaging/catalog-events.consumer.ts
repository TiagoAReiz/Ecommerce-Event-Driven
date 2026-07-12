import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { PAYMENT_EVENT_SERVICE } from '../../../core/interfaces/services/payment-event-service.interface';
import type {
  IPaymentEventService,
  SellerOnboardedPayload,
} from '../../../core/interfaces/services/payment-event-service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'catalog-events';

// Consome `catalog-events`: `SellerOnboarded` popula o read-model SellerPaymentProfile (com userId,
// pra ownership do GET /payments/splits). Demais eventos do catálogo são ignorados.
@Injectable()
export class CatalogEventsConsumer implements OnModuleInit {
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
      case 'SellerOnboarded':
        await this.eventService.handleSellerOnboarded(
          envelope.eventId,
          envelope.payload as SellerOnboardedPayload,
        );
        return;
      default:
        return;
    }
  }
}
