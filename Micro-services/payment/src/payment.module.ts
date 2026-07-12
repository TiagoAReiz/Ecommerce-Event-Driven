import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './adapters/in/controllers/payments.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { OrderEventsConsumer } from './adapters/in/messaging/order-events.consumer';
import { CatalogEventsConsumer } from './adapters/in/messaging/catalog-events.consumer';
import { TokenService } from './application/services/token.service';
import { PaymentQueryService } from './application/services/payment-query.service';
import { PaymentEventService } from './application/services/payment-event.service';
import { PaymentWebhookService } from './application/services/payment-webhook.service';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { StubMercadoPagoGateway } from './adapters/out/external/stub-mercado-pago.gateway';
import { PaymentRepository } from './adapters/out/repositories/payment.repository';
import { SellerPaymentProfileRepository } from './adapters/out/repositories/seller-payment-profile.repository';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { TOKEN_SERVICE } from './core/interfaces/services/token-service.interface';
import { PAYMENT_QUERY_SERVICE } from './core/interfaces/services/payment-query-service.interface';
import { PAYMENT_EVENT_SERVICE } from './core/interfaces/services/payment-event-service.interface';
import { PAYMENT_WEBHOOK_SERVICE } from './core/interfaces/services/payment-webhook-service.interface';
import { PAYMENT_REPOSITORY } from './core/interfaces/repositories/payment-repository.interface';
import { SELLER_PAYMENT_PROFILE_REPOSITORY } from './core/interfaces/repositories/seller-payment-profile-repository.interface';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';
import { MERCADO_PAGO_GATEWAY } from './core/interfaces/external/mercado-pago.interface';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [PaymentsController],
  providers: [
    { provide: TOKEN_SERVICE, useClass: TokenService },
    { provide: PAYMENT_QUERY_SERVICE, useClass: PaymentQueryService },
    { provide: PAYMENT_EVENT_SERVICE, useClass: PaymentEventService },
    { provide: PAYMENT_WEBHOOK_SERVICE, useClass: PaymentWebhookService },
    { provide: PAYMENT_REPOSITORY, useClass: PaymentRepository },
    { provide: SELLER_PAYMENT_PROFILE_REPOSITORY, useClass: SellerPaymentProfileRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: MERCADO_PAGO_GATEWAY, useClass: StubMercadoPagoGateway },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    OutboxRelayService,
    JwtAuthGuard,
    OrderEventsConsumer,
    CatalogEventsConsumer,
  ],
})
export class PaymentModule {}
