import { KafkaJS } from '@confluentinc/kafka-javascript';
import { PaymentEventsConsumer } from './payment-events.consumer';

function fakeMessage(topic: string, envelope: unknown): KafkaJS.EachMessagePayload {
  return {
    topic,
    partition: 0,
    message: { value: Buffer.from(JSON.stringify(envelope)) },
  } as unknown as KafkaJS.EachMessagePayload;
}

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = {
    handleOrderCreated: jest.fn(),
    handlePaymentConfirmed: jest.fn().mockResolvedValue(undefined),
  } as any;
  const consumer = new PaymentEventsConsumer(kafkaConsumer, eventService);
  return { consumer, eventService };
}

describe('PaymentEventsConsumer', () => {
  it('routes PaymentConfirmed to handlePaymentConfirmed', async () => {
    const { consumer, eventService } = buildConsumer();
    const envelope = {
      eventId: 'evt-2',
      eventType: 'PaymentConfirmed',
      aggregateType: 'Payment',
      aggregateId: 'order-1',
      occurredAt: new Date().toISOString(),
      version: 1,
      payload: { paymentId: 'p1', orderId: 'order-1', userId: 'user-1', method: 'PIX', totalAmount: 10, splits: [] },
    };
    await consumer.handle(fakeMessage('payment-events', envelope));
    expect(eventService.handlePaymentConfirmed).toHaveBeenCalledWith('evt-2', envelope.payload);
  });

  it('DELIBERATELY ignores PaymentFailed (and PaymentRefunded)', async () => {
    const { consumer, eventService } = buildConsumer();
    for (const eventType of ['PaymentFailed', 'PaymentRefunded']) {
      await consumer.handle(
        fakeMessage('payment-events', { eventId: 'e', eventType, payload: {} }),
      );
    }
    expect(eventService.handlePaymentConfirmed).not.toHaveBeenCalled();
  });
});
