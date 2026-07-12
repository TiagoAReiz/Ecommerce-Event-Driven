import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './adapters/in/controllers/auth.controller';
import { UsersController } from './adapters/in/controllers/users.controller';
import { JwtAuthGuard } from './adapters/in/controllers/guards/jwt-auth.guard';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';
import { AuthService } from './application/services/auth.service';
import { UserService } from './application/services/user.service';
import { TokenService } from './application/services/token.service';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { SellerEventService } from './application/services/seller-event.service';
import { CatalogEventsConsumer } from './adapters/in/messaging/catalog-events.consumer';
import { GoogleOAuthService } from './adapters/out/external/google-oauth.service';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { UserRepository } from './adapters/out/repositories/user.repository';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { AUTH_SERVICE } from './core/interfaces/services/auth-service.interface';
import { USER_SERVICE } from './core/interfaces/services/user-service.interface';
import { TOKEN_SERVICE } from './core/interfaces/services/token-service.interface';
import { USER_REPOSITORY } from './core/interfaces/repositories/user-repository.interface';
import { SELLER_EVENT_SERVICE } from './core/interfaces/services/seller-event.service.interface';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { GOOGLE_OAUTH_SERVICE } from './core/interfaces/external/google-oauth.interface';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [AuthController, UsersController],
  providers: [
    { provide: AUTH_SERVICE, useClass: AuthService },
    { provide: USER_SERVICE, useClass: UserService },
    { provide: TOKEN_SERVICE, useClass: TokenService },
    { provide: USER_REPOSITORY, useClass: UserRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: GOOGLE_OAUTH_SERVICE, useClass: GoogleOAuthService },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: SELLER_EVENT_SERVICE, useClass: SellerEventService },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    OutboxRelayService,
    CatalogEventsConsumer,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
