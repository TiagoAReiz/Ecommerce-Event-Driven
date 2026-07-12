import { Module } from '@nestjs/common';
import { ReviewController } from './adapters/in/controllers/review.controller';
import { ReviewService } from './application/services/review-service';


@Module({
  imports: [],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule { }
