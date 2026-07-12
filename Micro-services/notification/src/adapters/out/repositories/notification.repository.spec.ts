import { NotificationRepository } from './notification.repository';
import { Notification } from '../../../core/entities/notification.entity';

function buildRepo() {
  const tx = {
    processedEvent: { findUnique: jest.fn(), create: jest.fn() },
    notificationLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    notificationLog: { update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  } as any;
  return { repo: new NotificationRepository(prisma), prisma, tx };
}

function prismaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    userId: 'user-1',
    type: 'ORDER_CREATED',
    recipientEmail: 'a@b.com',
    subject: 'Seu pedido foi criado',
    status: 'PENDING',
    sentAt: null,
    createdAt: new Date('2026-07-10T09:59:00.000Z'),
    updatedAt: new Date('2026-07-10T09:59:00.000Z'),
    ...overrides,
  };
}

describe('NotificationRepository', () => {
  it('createPendingWithInbox dedupe-checks, creates a PENDING NotificationLog and the inbox row atomically', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue(null);
    tx.notificationLog.create.mockResolvedValue(prismaRow());
    tx.processedEvent.create.mockResolvedValue({});

    const notification = await repo.createPendingWithInbox('evt-1', 'OrderCreated', {
      userId: 'user-1',
      type: 'ORDER_CREATED',
      recipientEmail: 'a@b.com',
      subject: 'Seu pedido foi criado',
    });

    expect(tx.processedEvent.findUnique).toHaveBeenCalledWith({ where: { eventId: 'evt-1' } });
    expect(tx.notificationLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'ORDER_CREATED',
        recipientEmail: 'a@b.com',
        subject: 'Seu pedido foi criado',
      },
    });
    expect(tx.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', eventType: 'OrderCreated' },
    });
    expect(notification).toBeInstanceOf(Notification);
    expect(notification!.id).toBe('notif-1');
  });

  it('createPendingWithInbox returns null (no-op) when the eventId was already processed', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue({ id: 'inbox-1', eventId: 'evt-1' });

    const notification = await repo.createPendingWithInbox('evt-1', 'OrderCreated', {
      userId: 'user-1',
      type: 'ORDER_CREATED',
      recipientEmail: 'a@b.com',
      subject: 'Seu pedido foi criado',
    });

    expect(notification).toBeNull();
    expect(tx.notificationLog.create).not.toHaveBeenCalled();
  });

  it('markSent updates status SENT with the given timestamp', async () => {
    const { repo, prisma } = buildRepo();
    const sentAt = new Date('2026-07-10T10:00:00.000Z');

    await repo.markSent('notif-1', sentAt);

    expect(prisma.notificationLog.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { status: 'SENT', sentAt },
    });
  });

  it('markFailed updates status FAILED', async () => {
    const { repo, prisma } = buildRepo();

    await repo.markFailed('notif-1');

    expect(prisma.notificationLog.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { status: 'FAILED' },
    });
  });

  it('listByUser paginates ordered by createdAt desc and returns total/page/limit', async () => {
    const { repo, prisma } = buildRepo();
    prisma.notificationLog.findMany.mockResolvedValue([prismaRow()]);
    prisma.notificationLog.count.mockResolvedValue(1);

    const result = await repo.listByUser('user-1', 2, 10);

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(prisma.notificationLog.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(result).toEqual({ items: [expect.any(Notification)], total: 1, page: 2, limit: 10 });
  });
});
