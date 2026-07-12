import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ReviewRequest } from './dtos/review-request';
import type { IReviewService } from 'src/core/interfaces/services/review-service-interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(private readonly reviewService: IReviewService) { }

  @Post()
  sendReview(@Req() request: Request, @Body() review: ReviewRequest) {
    return this.reviewService.sendReview(review);
  }
}
