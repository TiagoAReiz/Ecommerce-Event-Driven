import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class ReviewRequest {
  @IsInt()
  @Min(1)
  @Max(5)
  grade: number;

  @IsString()
  @IsNotEmpty()
  comment: string;

  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  customerId: string;
}
