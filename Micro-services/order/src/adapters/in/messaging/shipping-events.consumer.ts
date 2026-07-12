import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { ORDER_EVENT_SERVICE } from '../../../core/interfaces/services/order-event-service.interface';
import type {
  FreightQuoteFailedPayload,
  FreightQuotedPayload,
  IOrderEventService,
  ShipmentDeliveredPayload,
  ShipmentDispatchedPayload,
} from '../../../core/interfaces/services/order-event-service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'shipping-events';

// Consome `shipping-events`: `FreightQuoted`/`FreightQuoteFailed` alimentam a agregação da saga
// (junto com StockReserved/StockReservationFailed); `ShipmentDispatched`/`ShipmentDelivered`
// só avançam o status do SubOrder (SHIPPED/DELIVERED), sem participar da agregação de checkout.
@Injectable()
export class ShippingEventsConsumer implements OnModuleInit {
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
      case 'FreightQuoted':
        await this.eventService.handleFreightQuoted(
          envelope.eventId,
          envelope.payload as FreightQuotedPayload,
        );
        return;
      case 'FreightQuoteFailed':
        await this.eventService.handleFreightQuoteFailed(
          envelope.eventId,
          envelope.payload as FreightQuoteFailedPayload,
        );
        return;
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
