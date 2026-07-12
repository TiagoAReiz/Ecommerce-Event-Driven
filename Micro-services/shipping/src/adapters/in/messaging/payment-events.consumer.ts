import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConsumerService } from '../../out/messaging/kafka-consumer.service';
import { SHIPPING_EVENT_SERVICE } from '../../../core/interfaces/services/shipping-event-service.interface';
import type {
  IShippingEventService,
  PaymentConfirmedPayload,
} from '../../../core/interfaces/services/shipping-event-service.interface';
import { parseEnvelope } from './parse-envelope';

const TOPIC = 'payment-events';

// Consome `payment-events`: só `PaymentConfirmed` interessa (cria o Shipment). shipping
// DELIBERADAMENTE NÃO consome `PaymentFailed` — não há nada pra limpar antes do Shipment existir,
// que só nasce reagindo a `PaymentConfirmed` (ver spec de endpoints, linha 243). `PaymentRefunded`
// também é ignorado aqui.
@Injectable()
export class PaymentEventsConsumer implements OnModuleInit {
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
      case 'PaymentConfirmed':
        await this.eventService.handlePaymentConfirmed(
          envelope.eventId,
          envelope.payload as PaymentConfirmedPayload,
        );
        return;
      default:
        return;
    }
  }
}
