import { Module } from '@nestjs/common';
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


@Module({
  imports: [ScheduleModule.forRoot(), JwtModule.register({})],
  controllers: [ReviewController],
  providers: [
    {
      provide: REVIEW_REPOSITORY, useClass: ReviewRepository
    },
    {
      provide: REVIEW_SERVICE, useClass: ReviewService
    },
    {
      provide: TOKEN_SERVICE, useClass: TokenService
    },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
    JwtAuthGuard
  ],
})
export class ReviewModule { }
