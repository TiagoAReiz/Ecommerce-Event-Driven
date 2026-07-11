import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { CepController } from './adapters/in/controllers/cep.controller';
import { FreightController } from './adapters/in/controllers/freight.controller';
import { AddressesController } from './adapters/in/controllers/addresses.controller';
import { ShipmentsController } from './adapters/in/controllers/shipments.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { OrderEventsConsumer } from './adapters/in/messaging/order-events.consumer';
import { PaymentEventsConsumer } from './adapters/in/messaging/payment-events.consumer';
import { AddressService } from './application/services/address.service';
import { FreightService } from './application/services/freight.service';
import { ShippingEventService } from './application/services/shipping-event.service';
import { ShipmentQueryService } from './application/services/shipment-query.service';
import { ShipmentTrackingService } from './application/services/shipment-tracking.service';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { AddressRepository } from './adapters/out/repositories/address.repository';
import { FreightQuoteRepository } from './adapters/out/repositories/freight-quote.repository';
import { ShipmentRepository } from './adapters/out/repositories/shipment.repository';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { StubCepGateway } from './adapters/out/external/stub-cep.gateway';
import { StubFreightGateway } from './adapters/out/external/stub-freight.gateway';
import { StubTrackingGateway } from './adapters/out/external/stub-tracking.gateway';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { ADDRESS_SERVICE } from './core/interfaces/services/address-service.interface';
import { FREIGHT_SERVICE } from './core/interfaces/services/freight-service.interface';
import { SHIPPING_EVENT_SERVICE } from './core/interfaces/services/shipping-event-service.interface';
import { SHIPMENT_QUERY_SERVICE } from './core/interfaces/services/shipment-query-service.interface';
import { ADDRESS_REPOSITORY } from './core/interfaces/repositories/address-repository.interface';
import { FREIGHT_QUOTE_REPOSITORY } from './core/interfaces/repositories/freight-quote-repository.interface';
import { SHIPMENT_REPOSITORY } from './core/interfaces/repositories/shipment-repository.interface';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { CEP_GATEWAY } from './core/interfaces/external/cep-gateway.interface';
import { FREIGHT_GATEWAY } from './core/interfaces/external/freight-gateway.interface';
import { TRACKING_GATEWAY } from './core/interfaces/external/tracking-gateway.interface';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [CepController, FreightController, AddressesController, ShipmentsController],
  providers: [
    { provide: ADDRESS_SERVICE, useClass: AddressService },
    { provide: FREIGHT_SERVICE, useClass: FreightService },
    { provide: SHIPPING_EVENT_SERVICE, useClass: ShippingEventService },
    { provide: SHIPMENT_QUERY_SERVICE, useClass: ShipmentQueryService },
    { provide: ADDRESS_REPOSITORY, useClass: AddressRepository },
    { provide: FREIGHT_QUOTE_REPOSITORY, useClass: FreightQuoteRepository },
    { provide: SHIPMENT_REPOSITORY, useClass: ShipmentRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: CEP_GATEWAY, useClass: StubCepGateway },
    { provide: FREIGHT_GATEWAY, useClass: StubFreightGateway },
    { provide: TRACKING_GATEWAY, useClass: StubTrackingGateway },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    OutboxRelayService,
    ShipmentTrackingService,
    JwtAuthGuard,
    OrderEventsConsumer,
    PaymentEventsConsumer,
  ],
})
export class ShippingModule {}
