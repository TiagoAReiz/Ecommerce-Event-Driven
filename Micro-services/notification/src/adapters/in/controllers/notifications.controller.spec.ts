import { NotificationsController } from './notifications.controller';
import { Notification } from '../../../core/entities/notification.entity';

function makeRequest(sub: string): any {
  return { user: { sub, email: 'a@b.com', role: 'CUSTOMER' } };
}

describe('NotificationsController', () => {
  it('lists the caller own notifications, parsing page/limit query params', async () => {
    const notification = new Notification({
      id: 'notif-1',
      userId: 'user-1',
      type: 'ORDER_CREATED',
      recipientEmail: 'a@b.com',
      subject: 'Seu pedido foi criado',
      status: 'SENT',
      sentAt: new Date('2026-07-10T10:00:00.000Z'),
      createdAt: new Date('2026-07-10T09:59:00.000Z'),
      updatedAt: new Date('2026-07-10T10:00:00.000Z'),
    });
    const notificationQueryService = {
      listByUser: jest.fn().mockResolvedValue({ items: [notification], total: 1, page: 2, limit: 5 }),
    } as any;
    const controller = new NotificationsController(notificationQueryService);

    const result = await controller.list(makeRequest('user-1'), '2', '5');

    expect(notificationQueryService.listByUser).toHaveBeenCalledWith('user-1', 2, 5);
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.items).toEqual([
      {
        id: 'notif-1',
        type: 'ORDER_CREATED',
        recipientEmail: 'a@b.com',
        subject: 'Seu pedido foi criado',
        status: 'SENT',
        sentAt: '2026-07-10T10:00:00.000Z',
        createdAt: '2026-07-10T09:59:00.000Z',
      },
    ]);
  });

  it('passes NaN through to the service when page/limit are omitted (service applies defaults)', async () => {
    const notificationQueryService = {
      listByUser: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    } as any;
    const controller = new NotificationsController(notificationQueryService);

    await controller.list(makeRequest('user-1'));

    expect(notificationQueryService.listByUser).toHaveBeenCalledWith('user-1', NaN, NaN);
  });
});
