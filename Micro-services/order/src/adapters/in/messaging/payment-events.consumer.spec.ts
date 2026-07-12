import { PaymentEventsConsumer } from './payment-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = {
    handlePaymentConfirmed: jest.fn(),
    handlePaymentFailed: jest.fn(),
    handlePaymentRefunded: jest.fn(),
  } as any;
  const consumer = new PaymentEventsConsumer(kafkaConsumer, eventService);
  return { consumer, kafkaConsumer, eventService };
}

function envelopeMessage(envelope: unknown) {
  return { topic: 'payment-events', message: { value: Buffer.from(JSON.stringify(envelope)) } } as any;
}

describe('PaymentEventsConsumer', () => {
  it('registers its handler on the payment-events topic during onModuleInit', async () => {
    const { consumer, kafkaConsumer } = buildConsumer();

    await consumer.onModuleInit();

    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('payment-events', expect.any(Function));
  });

  it('routes PaymentConfirmed to handlePaymentConfirmed', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = {
      paymentId: 'pay-1',
      orderId: 'order-1',
      userId: 'user-1',
      method: 'PIX',
      totalAmount: '100.00',
      splits: [],
    };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'PaymentConfirmed',
        aggregateType: 'Payment',
        aggregateId: 'order-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handlePaymentConfirmed).toHaveBeenCalledWith('evt-1', payload);
  });

  it('routes PaymentFailed to handlePaymentFailed', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { paymentId: 'pay-1', orderId: 'order-1', userId: 'user-1', method: 'PIX', reason: 'declined' };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'PaymentFailed',
        aggregateType: 'Payment',
        aggregateId: 'order-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handlePaymentFailed).toHaveBeenCalledWith('evt-2', payload);
  });

  it('routes PaymentRefunded to handlePaymentRefunded', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { paymentId: 'pay-1', orderId: 'order-1', userId: 'user-1', refundedAmount: '100.00', splits: [] };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-3',
        eventType: 'PaymentRefunded',
        aggregateType: 'Payment',
        aggregateId: 'order-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handlePaymentRefunded).toHaveBeenCalledWith('evt-3', payload);
  });

  it('ignores a malformed (unparseable) message without throwing', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle({
      topic: 'payment-events',
      message: { value: Buffer.from('not-json') },
    } as any);

    expect(eventService.handlePaymentConfirmed).not.toHaveBeenCalled();
    expect(eventService.handlePaymentFailed).not.toHaveBeenCalled();
    expect(eventService.handlePaymentRefunded).not.toHaveBeenCalled();
  });
});
