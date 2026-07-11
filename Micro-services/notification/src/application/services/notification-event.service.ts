import { Inject, Injectable, Logger } from '@nestjs/common';
import { USER_CONTACT_REPOSITORY } from '../../core/interfaces/repositories/user-contact-repository.interface';
import type { IUserContactRepository } from '../../core/interfaces/repositories/user-contact-repository.interface';
import { NOTIFICATION_REPOSITORY } from '../../core/interfaces/repositories/notification-repository.interface';
import type { INotificationRepository } from '../../core/interfaces/repositories/notification-repository.interface';
import { EMAIL_SENDER } from '../../core/interfaces/external/email-sender.interface';
import type { IEmailSender } from '../../core/interfaces/external/email-sender.interface';
import { UserContactNotFoundException } from '../../core/exceptions/user-contact-not-found.exception';
import { NotificationType } from '../../core/entities/notification.entity';
import {
  INotificationEventService,
  OrderCancelledPayload,
  OrderCreatedPayload,
  PaymentConfirmedPayload,
  PaymentFailedPayload,
  PaymentRefundedPayload,
  ShipmentDeliveredPayload,
  ShipmentDispatchedPayload,
  UserRegisteredPayload,
} from '../../core/interfaces/services/notification-event.service.interface';

// Payloads de todo evento de negócio disparador de e-mail carregam pelo menos `userId` — usado
// tanto pra resolver o destinatário via UserContact quanto pra montar o corpo do e-mail.
interface NotifiableEventPayload {
  userId: string;
}

@Injectable()
export class NotificationEventService implements INotificationEventService {
  private readonly logger = new Logger(NotificationEventService.name);

  constructor(
    @Inject(USER_CONTACT_REPOSITORY) private readonly userContactRepository: IUserContactRepository,
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepository: INotificationRepository,
    @Inject(EMAIL_SENDER) private readonly emailSender: IEmailSender,
  ) {}

  async handleUserRegistered(eventId: string, payload: UserRegisteredPayload): Promise<void> {
    await this.userContactRepository.upsertWithInbox(eventId, 'UserRegistered', {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
    });
  }

  async handleOrderCreated(eventId: string, payload: OrderCreatedPayload): Promise<void> {
    await this.dispatch(eventId, 'OrderCreated', payload, 'ORDER_CREATED', 'Seu pedido foi criado');
  }

  async handleOrderCancelled(eventId: string, payload: OrderCancelledPayload): Promise<void> {
    await this.dispatch(eventId, 'OrderCancelled', payload, 'ORDER_CANCELLED', 'Seu pedido foi cancelado');
  }

  async handlePaymentConfirmed(eventId: string, payload: PaymentConfirmedPayload): Promise<void> {
    await this.dispatch(eventId, 'PaymentConfirmed', payload, 'PAYMENT_CONFIRMED', 'Pagamento confirmado');
  }

  async handlePaymentFailed(eventId: string, payload: PaymentFailedPayload): Promise<void> {
    await this.dispatch(eventId, 'PaymentFailed', payload, 'PAYMENT_FAILED', 'Falha no pagamento');
  }

  async handlePaymentRefunded(eventId: string, payload: PaymentRefundedPayload): Promise<void> {
    await this.dispatch(eventId, 'PaymentRefunded', payload, 'PAYMENT_REFUNDED', 'Reembolso processado');
  }

  async handleShipmentDispatched(eventId: string, payload: ShipmentDispatchedPayload): Promise<void> {
    await this.dispatch(
      eventId,
      'ShipmentDispatched',
      payload,
      'SHIPMENT_DISPATCHED',
      'Seu pedido foi enviado',
    );
  }

  async handleShipmentDelivered(eventId: string, payload: ShipmentDeliveredPayload): Promise<void> {
    await this.dispatch(
      eventId,
      'ShipmentDelivered',
      payload,
      'SHIPMENT_DELIVERED',
      'Seu pedido foi entregue',
    );
  }

  // Fluxo comum a todo evento "notificável": resolve o contato, grava a Notification como PENDING
  // dentro da mesma transação do dedupe de inbox (atômico), e só DEPOIS do commit dispara o
  // side-effect externo (envio de e-mail) — se a Notification já existia (evento reentregue), o
  // repositório retorna `null` e não reenviamos e-mail duplicado.
  private async dispatch(
    eventId: string,
    eventType: string,
    payload: NotifiableEventPayload,
    type: NotificationType,
    subject: string,
  ): Promise<void> {
    const contact = await this.userContactRepository.findByUserId(payload.userId);
    if (!contact) {
      throw new UserContactNotFoundException(payload.userId);
    }

    const notification = await this.notificationRepository.createPendingWithInbox(eventId, eventType, {
      userId: payload.userId,
      type,
      recipientEmail: contact.email,
      subject,
    });
    if (!notification) return; // eventId já processado (redelivery) — no-op

    try {
      await this.emailSender.send({
        to: notification.recipientEmail,
        subject: notification.subject,
        body: `Olá ${contact.name}, ${subject.toLowerCase()}. (evento ${eventType}, id ${eventId})`,
      });
      await this.notificationRepository.markSent(notification.id, new Date());
    } catch (error) {
      this.logger.error(`Failed to send notification ${notification.id}`, error as Error);
      await this.notificationRepository.markFailed(notification.id);
    }
  }
}
