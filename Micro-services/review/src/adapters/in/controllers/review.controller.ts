import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ReviewRequest } from './dtos/review-request';
import type { IReviewService } from 'src/core/interfaces/services/review-service-interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { REVIEW_SERVICE } from 'src/core/interfaces/services/review-service-interface';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(@Inject(REVIEW_SERVICE) private readonly reviewService: IReviewService) { }

  @Post()
  sendReview(@Req() request: Request, @Body() review: ReviewRequest) {
    return this.reviewService.sendReview(review);
  }
}
