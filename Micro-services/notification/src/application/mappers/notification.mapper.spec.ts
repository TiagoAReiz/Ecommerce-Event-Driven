import { NotificationMapper } from './notification.mapper';
import { Notification } from '../../core/entities/notification.entity';

function makeNotification(overrides: Partial<ConstructorParameters<typeof Notification>[0]> = {}) {
  return new Notification({
    id: 'notif-1',
    userId: 'user-1',
    type: 'ORDER_CREATED',
    recipientEmail: 'a@b.com',
    subject: 'Seu pedido foi criado',
    status: 'SENT',
    sentAt: new Date('2026-07-10T10:00:00.000Z'),
    createdAt: new Date('2026-07-10T09:59:00.000Z'),
    updatedAt: new Date('2026-07-10T10:00:00.000Z'),
    ...overrides,
  });
}

describe('NotificationMapper', () => {
  it('maps a Notification entity to the response shape', () => {
    const notification = makeNotification();

    const dto = NotificationMapper.toResponse(notification);

    expect(dto).toEqual({
      id: 'notif-1',
      type: 'ORDER_CREATED',
      recipientEmail: 'a@b.com',
      subject: 'Seu pedido foi criado',
      status: 'SENT',
      sentAt: '2026-07-10T10:00:00.000Z',
      createdAt: '2026-07-10T09:59:00.000Z',
    });
  });

  it('maps sentAt null through for a not-yet-sent notification', () => {
    const notification = makeNotification({ status: 'PENDING', sentAt: null });

    const dto = NotificationMapper.toResponse(notification);

    expect(dto.sentAt).toBeNull();
  });

  it('maps a paginated result, preserving total/page/limit', () => {
    const result = { items: [makeNotification()], total: 1, page: 2, limit: 10 };

    const dto = NotificationMapper.toListResponse(result);

    expect(dto.total).toBe(1);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(10);
    expect(dto.items).toHaveLength(1);
    expect(dto.items[0].id).toBe('notif-1');
  });
});
