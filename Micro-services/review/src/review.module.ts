import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ReviewController } from './adapters/in/controllers/review.controller';
import { ReviewService } from './application/services/review-service';
import { REVIEW_REPOSITORY } from './core/interfaces/repositories/review-repository-interface';
import { ReviewRepository } from './adapters/out/repositories/review-repository';
import { REVIEW_SERVICE } from './core/interfaces/services/review-service-interface';
import { TOKEN_SERVICE } from './core/interfaces/services/token-service.interface';
import { TokenService } from './application/services/token.service';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { ORDER_CLIENT } from './core/interfaces/external/order-client.interface';
import { OrderHttpClient } from './adapters/out/external/order-http-client';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { KafkaModule } from './adapters/out/messaging/kafka/kafka.module';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({}), KafkaModule],
  controllers: [ReviewController],
  providers: [
    { provide: REVIEW_REPOSITORY, useClass: ReviewRepository },
    { provide: REVIEW_SERVICE, useClass: ReviewService },
    { provide: TOKEN_SERVICE, useClass: TokenService },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: ORDER_CLIENT, useClass: OrderHttpClient },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    OutboxRelayService,
    JwtAuthGuard,
  ],
})
export class ReviewModule { }
