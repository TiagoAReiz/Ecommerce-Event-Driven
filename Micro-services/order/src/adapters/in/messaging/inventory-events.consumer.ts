import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { ORDER_EVENT_SERVICE } from '../../../core/interfaces/services/order-event-service.interface';
import type {
  IOrderEventService,
  StockReleasedPayload,
  StockReservationFailedPayload,
  StockReservedPayload,
} from '../../../core/interfaces/services/order-event-service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'inventory-events';

// Consome `inventory-events`: `StockReserved`/`StockReservationFailed` alimentam a agregação
// da saga (junto com `FreightQuoted`/`FreightQuoteFailed`, ver shipping-events.consumer.ts);
// `StockReleased` só interessa quando `reason = EXPIRED` (ver order-repository.interface.ts).
@Injectable()
export class InventoryEventsConsumer implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    @Inject(ORDER_EVENT_SERVICE) private readonly eventService: IOrderEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.registerHandler(TOPIC, (message) => this.handle(message));
  }

  async handle(message: KafkaJS.EachMessagePayload): Promise<void> {
    const envelope = parseEnvelope(message);
    if (!envelope) return;

    switch (envelope.eventType) {
      case 'StockReserved':
        await this.eventService.handleStockReserved(
          envelope.eventId,
          envelope.payload as StockReservedPayload,
        );
        return;
      case 'StockReservationFailed':
        await this.eventService.handleStockReservationFailed(
          envelope.eventId,
          envelope.payload as StockReservationFailedPayload,
        );
        return;
      case 'StockReleased':
        await this.eventService.handleStockReleased(
          envelope.eventId,
          envelope.payload as StockReleasedPayload,
        );
        return;
      default:
        return;
    }
  }
}
