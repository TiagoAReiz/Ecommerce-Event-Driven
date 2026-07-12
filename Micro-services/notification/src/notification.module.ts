import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './adapters/in/controllers/notifications.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { AuthEventsConsumer } from './adapters/in/messaging/auth-events.consumer';
import { OrderEventsConsumer } from './adapters/in/messaging/order-events.consumer';
import { PaymentEventsConsumer } from './adapters/in/messaging/payment-events.consumer';
import { ShippingEventsConsumer } from './adapters/in/messaging/shipping-events.consumer';
import { NotificationEventService } from './application/services/notification-event.service';
import { NotificationQueryService } from './application/services/notification-query.service';
import { UserContactRepository } from './adapters/out/repositories/user-contact.repository';
import { NotificationRepository } from './adapters/out/repositories/notification.repository';
import { StubEmailSenderService } from './adapters/out/external/stub-email-sender.service';
import { NOTIFICATION_EVENT_SERVICE } from './core/interfaces/services/notification-event.service.interface';
import { NOTIFICATION_QUERY_SERVICE } from './core/interfaces/services/notification-query.service.interface';
import { USER_CONTACT_REPOSITORY } from './core/interfaces/repositories/user-contact-repository.interface';
import { NOTIFICATION_REPOSITORY } from './core/interfaces/repositories/notification-repository.interface';
import { EMAIL_SENDER } from './core/interfaces/external/email-sender.interface';

@Module({
  imports: [JwtModule.register({})],
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATION_EVENT_SERVICE, useClass: NotificationEventService },
    { provide: NOTIFICATION_QUERY_SERVICE, useClass: NotificationQueryService },
    { provide: USER_CONTACT_REPOSITORY, useClass: UserContactRepository },
    { provide: NOTIFICATION_REPOSITORY, useClass: NotificationRepository },
    { provide: EMAIL_SENDER, useClass: StubEmailSenderService },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    JwtAuthGuard,
    AuthEventsConsumer,
    OrderEventsConsumer,
    PaymentEventsConsumer,
    ShippingEventsConsumer,
  ],
})
export class NotificationModule {}
