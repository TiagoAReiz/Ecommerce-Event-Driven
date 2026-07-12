import { Test, TestingModule } from '@nestjs/testing';
import { ReviewController } from './review.controller';
import { ReviewService } from '../../../application/services/review-service';

describe('ReviewController', () => {
  let appController: ReviewController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ReviewController],
      providers: [ReviewService],
    }).compile();

    appController = app.get<ReviewController>(ReviewController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {

    });
  });
});
