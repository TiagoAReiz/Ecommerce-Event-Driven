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
  const sellerProfileRepository = { findBySellerId: jest.fn(), upsertWithInbox: jest.fn() } as any;
  const service = new NotificationEventService(
    userContactRepository,
    notificationRepository,
    emailSender,
    sellerProfileRepository,
  );
  return { service, userContactRepository, notificationRepository, emailSender, sellerProfileRepository };
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

  describe('handleSellerOnboarded', () => {
    it('upserts the SellerProfile read-model with dedupe via inbox', async () => {
      const { service, sellerProfileRepository } = buildService();

      await service.handleSellerOnboarded('evt-1', {
        sellerId: 'seller-1',
        userId: 'user-1',
        storeName: 'Loja X',
        document: '123',
        mpCollectorId: 'mp-1',
      });

      expect(sellerProfileRepository.upsertWithInbox).toHaveBeenCalledWith('evt-1', 'SellerOnboarded', {
        sellerId: 'seller-1',
        userId: 'user-1',
      });
    });
  });

  describe('handleReviewSent', () => {
    const payload = {
      reviewId: 'review-1',
      customerId: 'customer-1',
      productId: 'prod-1',
      sellerId: 'seller-1',
      grade: 5,
      comment: 'Ótimo produto!',
      orderId: 'order-1',
    };

    it('logs and gives up without throwing when no SellerProfile is found for sellerId', async () => {
      const { service, sellerProfileRepository, notificationRepository, emailSender } = buildService();
      sellerProfileRepository.findBySellerId.mockResolvedValue(null);

      await service.handleReviewSent('evt-1', payload);

      expect(notificationRepository.createPendingWithInbox).not.toHaveBeenCalled();
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it('throws UserContactNotFoundException when the seller has no UserContact yet', async () => {
      const { service, sellerProfileRepository, userContactRepository } = buildService();
      sellerProfileRepository.findBySellerId.mockResolvedValue({ sellerId: 'seller-1', userId: 'seller-user-1' });
      userContactRepository.findByUserId.mockResolvedValue(null);

      await expect(service.handleReviewSent('evt-1', payload)).rejects.toThrow(UserContactNotFoundException);
    });

    it('emails the seller with the customer name, grade and comment when everything resolves', async () => {
      const { service, sellerProfileRepository, userContactRepository, notificationRepository, emailSender } = buildService();
      sellerProfileRepository.findBySellerId.mockResolvedValue({ sellerId: 'seller-1', userId: 'seller-user-1' });
      userContactRepository.findByUserId.mockImplementation(async (userId: string) => {
        if (userId === 'seller-user-1') return { userId, email: 'seller@example.com', name: 'Seller Store' };
        if (userId === 'customer-1') return { userId, email: 'customer@example.com', name: 'Ana' };
        return null;
      });
      notificationRepository.createPendingWithInbox.mockResolvedValue({
        id: 'notif-1',
        recipientEmail: 'seller@example.com',
        subject: 'Nova avaliação recebida',
      });

      await service.handleReviewSent('evt-1', payload);

      expect(notificationRepository.createPendingWithInbox).toHaveBeenCalledWith('evt-1', 'ReviewSent', {
        userId: 'seller-user-1',
        type: 'REVIEW_RECEIVED',
        recipientEmail: 'seller@example.com',
        subject: 'Nova avaliação recebida',
      });
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'seller@example.com',
          subject: 'Nova avaliação recebida',
          body: expect.stringContaining('Ana'),
        }),
      );
      expect(emailSender.send.mock.calls[0][0].body).toContain('5');
      expect(emailSender.send.mock.calls[0][0].body).toContain('Ótimo produto!');
      expect(notificationRepository.markSent).toHaveBeenCalledWith('notif-1', expect.any(Date));
    });

    it('falls back to a generic customer label when the customer has no UserContact', async () => {
      const { service, sellerProfileRepository, userContactRepository, notificationRepository, emailSender } = buildService();
      sellerProfileRepository.findBySellerId.mockResolvedValue({ sellerId: 'seller-1', userId: 'seller-user-1' });
      userContactRepository.findByUserId.mockImplementation(async (userId: string) => {
        if (userId === 'seller-user-1') return { userId, email: 'seller@example.com', name: 'Seller Store' };
        return null;
      });
      notificationRepository.createPendingWithInbox.mockResolvedValue({
        id: 'notif-1',
        recipientEmail: 'seller@example.com',
        subject: 'Nova avaliação recebida',
      });

      await service.handleReviewSent('evt-1', payload);

      expect(emailSender.send.mock.calls[0][0].body).toContain('Um cliente');
    });
  });
});
