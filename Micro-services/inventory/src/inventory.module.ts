import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { StockController } from './adapters/in/controllers/stock.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { OrderEventsConsumer } from './adapters/in/messaging/order-events.consumer';
import { PaymentEventsConsumer } from './adapters/in/messaging/payment-events.consumer';
import { StockService } from './application/services/stock.service';
import { StockEventService } from './application/services/stock-event.service';
import { TokenService } from './application/services/token.service';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { ReservationExpiryService } from './application/services/reservation-expiry.service';
import { StockItemRepository } from './adapters/out/repositories/stock-item.repository';
import { StockReservationRepository } from './adapters/out/repositories/stock-reservation.repository';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { CatalogHttpClient } from './adapters/out/external/catalog-http-client';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { STOCK_SERVICE } from './core/interfaces/services/stock-service.interface';
import { STOCK_EVENT_SERVICE } from './core/interfaces/services/stock-event-service.interface';
import { TOKEN_SERVICE } from './core/interfaces/services/token-service.interface';
import { STOCK_ITEM_REPOSITORY } from './core/interfaces/repositories/stock-item-repository.interface';
import { STOCK_RESERVATION_REPOSITORY } from './core/interfaces/repositories/stock-reservation-repository.interface';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { CATALOG_CLIENT } from './core/interfaces/external/catalog-client.interface';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [StockController],
  providers: [
    { provide: STOCK_SERVICE, useClass: StockService },
    { provide: STOCK_EVENT_SERVICE, useClass: StockEventService },
    { provide: TOKEN_SERVICE, useClass: TokenService },
    { provide: STOCK_ITEM_REPOSITORY, useClass: StockItemRepository },
    { provide: STOCK_RESERVATION_REPOSITORY, useClass: StockReservationRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: CATALOG_CLIENT, useClass: CatalogHttpClient },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    OutboxRelayService,
    ReservationExpiryService,
    JwtAuthGuard,
    OrderEventsConsumer,
    PaymentEventsConsumer,
  ],
})
export class InventoryModule {}
