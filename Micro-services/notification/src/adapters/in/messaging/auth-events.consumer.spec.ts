import { AuthEventsConsumer } from './auth-events.consumer';

function buildConsumer() {
  const kafkaConsumer = { registerHandler: jest.fn() } as any;
  const eventService = { handleUserRegistered: jest.fn() } as any;
  const consumer = new AuthEventsConsumer(kafkaConsumer, eventService);
  return { consumer, kafkaConsumer, eventService };
}

function envelopeMessage(envelope: unknown) {
  return { topic: 'auth-events', message: { value: Buffer.from(JSON.stringify(envelope)) } } as any;
}

describe('AuthEventsConsumer', () => {
  it('registers its handler on the auth-events topic during onModuleInit', async () => {
    const { consumer, kafkaConsumer } = buildConsumer();

    await consumer.onModuleInit();

    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith('auth-events', expect.any(Function));
  });

  it('routes UserRegistered to handleUserRegistered', async () => {
    const { consumer, eventService } = buildConsumer();
    const payload = { userId: 'user-1', email: 'a@b.com', name: 'Ana', role: 'CUSTOMER' };

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-1',
        eventType: 'UserRegistered',
        aggregateType: 'User',
        aggregateId: 'user-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload,
      }),
    );

    expect(eventService.handleUserRegistered).toHaveBeenCalledWith('evt-1', payload);
  });

  it('silently ignores an eventType it does not consume (UserRoleChanged)', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle(
      envelopeMessage({
        eventId: 'evt-2',
        eventType: 'UserRoleChanged',
        aggregateType: 'User',
        aggregateId: 'user-1',
        occurredAt: '2026-07-10T10:00:00.000Z',
        version: 1,
        payload: { userId: 'user-1', oldRole: 'CUSTOMER', newRole: 'SELLER' },
      }),
    );

    expect(eventService.handleUserRegistered).not.toHaveBeenCalled();
  });

  it('silently ignores a malformed message with no value', async () => {
    const { consumer, eventService } = buildConsumer();

    await consumer.handle({ topic: 'auth-events', message: { value: null } } as any);

    expect(eventService.handleUserRegistered).not.toHaveBeenCalled();
  });
});
