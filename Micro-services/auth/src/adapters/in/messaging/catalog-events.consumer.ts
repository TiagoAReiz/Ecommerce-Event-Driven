import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { SELLER_EVENT_SERVICE } from '../../../core/interfaces/services/seller-event.service.interface';
import type {
  ISellerEventService,
  SellerOnboardedPayload,
} from '../../../core/interfaces/services/seller-event.service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'catalog-events';

// Consome `catalog-events`: só `SellerOnboarded` interessa ao auth (promove role -> SELLER).
// Os demais eventos do catalog (ProductCreated, ProductVariantPriceChanged) são ignorados.
@Injectable()
export class CatalogEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(SELLER_EVENT_SERVICE) private readonly sellerEventService: ISellerEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope<SellerOnboardedPayload>(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'SellerOnboarded':
        await this.sellerEventService.handleSellerOnboarded(envelope.eventId, envelope.payload);
        return;
      default:
        return;
    }
  }
}
