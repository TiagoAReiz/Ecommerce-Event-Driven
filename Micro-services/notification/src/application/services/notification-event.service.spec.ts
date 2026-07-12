import { NotificationEventService } from './notification-event.service';
import { UserContactNotFoundException } from '../../core/exceptions/user-contact-not-found.exception';
import { Notification } from '../../core/entities/notification.entity';
import { UserContact } from '../../core/entities/user-contact.entity';

function buildService() {
  const userContactRepository = { findByUserId: jest.fn(), upsertWithInbox: jest.fn() } as any;
  const notificationRepository = {
    createPendingWithInbox: jest.fn(),
    markSent: jest.fn(),
    markFailed: jest.fn(),
  } as any;
  const emailSender = { send: jest.fn() } as any;
  const service = new NotificationEventService(userContactRepository, notificationRepository, emailSender);
  return { service, userContactRepository, notificationRepository, emailSender };
}

function makeContact(userId = 'user-1') {
  return new UserContact({ userId, email: 'a@b.com', name: 'Ana' });
}

function makeNotification(overrides: Partial<ConstructorParameters<typeof Notification>[0]> = {}) {
  return new Notification({
    id: 'notif-1',
    userId: 'user-1',
    type: 'ORDER_CREATED',
    recipientEmail: 'a@b.com',
    subject: 'Seu pedido foi criado',
    status: 'PENDING',
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('NotificationEventService', () => {
  describe('handleUserRegistered', () => {
    it('upserts the UserContact read-model via the inbox port', async () => {
      const { service, userContactRepository } = buildService();
      userContactRepository.upsertWithInbox.mockResolvedValue(true);

      await service.handleUserRegistered('evt-1', {
        userId: 'user-1',
        email: 'a@b.com',
        name: 'Ana',
        role: 'CUSTOMER',
      });

      expect(userContactRepository.upsertWithInbox).toHaveBeenCalledWith('evt-1', 'UserRegistered', {
        userId: 'user-1',
        email: 'a@b.com',
        name: 'Ana',
      });
    });
  });

  describe('dispatch (shared by every notifiable event)', () => {
    it('resolves the recipient, records a PENDING notification, sends the stub email and marks SENT', async () => {
      const { service, userContactRepository, notificationRepository, emailSender } = buildService();
      userContactRepository.findByUserId.mockResolvedValue(makeContact());
      notificationRepository.createPendingWithInbox.mockResolvedValue(makeNotification());
      emailSender.send.mockResolvedValue(undefined);

      await service.handleOrderCreated('evt-1', {
        orderId: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        subOrders: [],
      });

      expect(userContactRepository.findByUserId).toHaveBeenCalledWith('user-1');
      expect(notificationRepository.createPendingWithInbox).toHaveBeenCalledWith(
        'evt-1',
        'OrderCreated',
        {
          userId: 'user-1',
          type: 'ORDER_CREATED',
          recipientEmail: 'a@b.com',
          subject: 'Seu pedido foi criado',
        },
      );
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.com', subject: 'Seu pedido foi criado' }),
      );
      expect(notificationRepository.markSent).toHaveBeenCalledWith('notif-1', expect.any(Date));
      expect(notificationRepository.markFailed).not.toHaveBeenCalled();
    });

    it('throws UserContactNotFoundException and never touches NotificationLog when the contact is unresolved', async () => {
      const { service, userContactRepository, notificationRepository } = buildService();
      userContactRepository.findByUserId.mockResolvedValue(null);

      await expect(
        service.handleOrderCreated('evt-1', {
          orderId: 'order-1',
          userId: 'user-unknown',
          addressId: 'addr-1',
          subOrders: [],
        }),
      ).rejects.toThrow(UserContactNotFoundException);
      expect(notificationRepository.createPendingWithInbox).not.toHaveBeenCalled();
    });

    it('is a no-op (no email sent) when the eventId was already processed (redelivery)', async () => {
      const { service, userContactRepository, notificationRepository, emailSender } = buildService();
      userContactRepository.findByUserId.mockResolvedValue(makeContact());
      notificationRepository.createPendingWithInbox.mockResolvedValue(null);

      await service.handleOrderCreated('evt-1', {
        orderId: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        subOrders: [],
      });

      expect(emailSender.send).not.toHaveBeenCalled();
      expect(notificationRepository.markSent).not.toHaveBeenCalled();
    });

    it('marks the notification FAILED (and swallows the error) when the email sender rejects', async () => {
      const { service, userContactRepository, notificationRepository, emailSender } = buildService();
      userContactRepository.findByUserId.mockResolvedValue(makeContact());
      notificationRepository.createPendingWithInbox.mockResolvedValue(makeNotification());
      emailSender.send.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.handleOrderCreated('evt-1', {
          orderId: 'order-1',
          userId: 'user-1',
          addressId: 'addr-1',
          subOrders: [],
        }),
      ).resolves.toBeUndefined();

      expect(notificationRepository.markFailed).toHaveBeenCalledWith('notif-1');
      expect(notificationRepository.markSent).not.toHaveBeenCalled();
    });
  });

  describe('event type -> NotificationType/subject mapping', () => {
    it.each([
      ['handleOrderCreated', { orderId: 'o-1', userId: 'user-1', addressId: 'a-1', subOrders: [] }, 'OrderCreated', 'ORDER_CREATED'],
      [
        'handleOrderCancelled',
        { orderId: 'o-1', userId: 'user-1', subOrderIds: [], cancelReason: 'x', initiatedBy: 'CUSTOMER' },
        'OrderCancelled',
        'ORDER_CANCELLED',
      ],
      [
        'handlePaymentConfirmed',
        { paymentId: 'p-1', orderId: 'o-1', userId: 'user-1', method: 'PIX', totalAmount: 100, splits: [] },
        'PaymentConfirmed',
        'PAYMENT_CONFIRMED',
      ],
      [
        'handlePaymentFailed',
        { paymentId: 'p-1', orderId: 'o-1', userId: 'user-1', method: 'PIX', reason: 'declined' },
        'PaymentFailed',
        'PAYMENT_FAILED',
      ],
      [
        'handlePaymentRefunded',
        { paymentId: 'p-1', orderId: 'o-1', userId: 'user-1', refundedAmount: 100, splits: [] },
        'PaymentRefunded',
        'PAYMENT_REFUNDED',
      ],
      [
        'handleShipmentDispatched',
        {
          subOrderId: 's-1',
          orderId: 'o-1',
          userId: 'user-1',
          trackingCode: 'TRACK',
          carrier: 'Correios',
          estimatedDeliveryDate: '2026-08-01',
        },
        'ShipmentDispatched',
        'SHIPMENT_DISPATCHED',
      ],
      [
        'handleShipmentDelivered',
        { subOrderId: 's-1', orderId: 'o-1', userId: 'user-1', deliveredAt: '2026-08-01' },
        'ShipmentDelivered',
        'SHIPMENT_DELIVERED',
      ],
    ])('%s records a %s inbox entry as NotificationType %s', async (method, payload, eventType, type) => {
      const { service, userContactRepository, notificationRepository } = buildService();
      userContactRepository.findByUserId.mockResolvedValue(makeContact());
      notificationRepository.createPendingWithInbox.mockResolvedValue(makeNotification({ type: type as any }));

      await (service as any)[method]('evt-1', payload);

      expect(notificationRepository.createPendingWithInbox).toHaveBeenCalledWith(
        'evt-1',
        eventType,
        expect.objectContaining({ userId: 'user-1', type }),
      );
    });
  });
});
