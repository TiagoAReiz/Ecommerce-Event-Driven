import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './adapters/in/http/auth.controller';
import { UsersController } from './adapters/in/http/users.controller';
import { JwtAuthGuard } from './adapters/in/http/jwt-auth.guard';
import { AuthService } from './core/auth/auth.service';
import { GoogleOAuthService } from './core/auth/google-oauth.service';
import { TokenService } from './core/auth/token.service';
import { OutboxRelayService } from './core/auth/outbox-relay.service';

@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [AuthController, UsersController],
  providers: [AuthService, GoogleOAuthService, TokenService, JwtAuthGuard, OutboxRelayService],
})
export class AuthModule {}
