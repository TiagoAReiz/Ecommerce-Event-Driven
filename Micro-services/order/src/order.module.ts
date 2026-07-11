import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersController } from './adapters/in/controllers/orders.controller';
import { SubOrdersController } from './adapters/in/controllers/sub-orders.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { InventoryEventsConsumer } from './adapters/in/messaging/inventory-events.consumer';
import { ShippingEventsConsumer } from './adapters/in/messaging/shipping-events.consumer';
import { PaymentEventsConsumer } from './adapters/in/messaging/payment-events.consumer';
import { OrderService } from './application/services/order.service';
import { OrderEventService } from './application/services/order-event.service';
import { TokenService } from './application/services/token.service';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { OrderRepository } from './adapters/out/repositories/order.repository';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { CartHttpClient } from './adapters/out/external/cart-http-client';
import { CatalogHttpClient } from './adapters/out/external/catalog-http-client';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { ORDER_SERVICE } from './core/interfaces/services/order-service.interface';
import { ORDER_EVENT_SERVICE } from './core/interfaces/services/order-event-service.interface';
import { TOKEN_SERVICE } from './core/interfaces/services/token-service.interface';
import { ORDER_REPOSITORY } from './core/interfaces/repositories/order-repository.interface';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { CART_CLIENT } from './core/interfaces/external/cart-client.interface';
import { CATALOG_CLIENT } from './core/interfaces/external/catalog-client.interface';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [OrdersController, SubOrdersController],
  providers: [
    { provide: ORDER_SERVICE, useClass: OrderService },
    { provide: ORDER_EVENT_SERVICE, useClass: OrderEventService },
    { provide: TOKEN_SERVICE, useClass: TokenService },
    { provide: ORDER_REPOSITORY, useClass: OrderRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: CART_CLIENT, useClass: CartHttpClient },
    { provide: CATALOG_CLIENT, useClass: CatalogHttpClient },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    OutboxRelayService,
    JwtAuthGuard,
    InventoryEventsConsumer,
    ShippingEventsConsumer,
    PaymentEventsConsumer,
  ],
})
export class OrderModule {}
