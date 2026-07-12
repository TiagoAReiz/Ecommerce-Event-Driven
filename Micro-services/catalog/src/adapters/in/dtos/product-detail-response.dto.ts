import { ProductResponseDto } from './product-response.dto';
import { ProductVariantResponseDto } from './product-variant-response.dto';

export class ProductDetailResponseDto extends ProductResponseDto {
  variants!: ProductVariantResponseDto[];
}
