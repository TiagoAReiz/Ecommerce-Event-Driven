import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './adapters/in/http/auth.controller';
import { UsersController } from './adapters/in/http/users.controller';
import { JwtAuthGuard } from './adapters/in/http/jwt-auth.guard';
import { AuthService } from './core/auth/auth.service';
import { GoogleOAuthService } from './adapters/out/external/google-oauth.service';
import { TokenService } from './application/services/token.service';
import { OutboxRelayService } from './application/services/outbox-relay.service';
import { USER_REPOSITORY } from './core/interfaces/repositories/user-repository.interface';
import { OUTBOX_EVENT_REPOSITORY } from './core/interfaces/repositories/outbox-event-repository.interface';
import { EVENT_PUBLISHER } from './core/interfaces/external/event-publisher.interface';
import { UserRepository } from './adapters/out/repositories/user.repository';
import { OutboxEventRepository } from './adapters/out/repositories/outbox-event.repository';
import { KafkaEventPublisher } from './adapters/out/external/kafka-event-publisher';
import { DomainExceptionFilter } from './adapters/in/filters/domain-exception.filter';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    GoogleOAuthService,
    TokenService,
    JwtAuthGuard,
    OutboxRelayService,
    { provide: USER_REPOSITORY, useClass: UserRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: OutboxEventRepository },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AuthModule {}
