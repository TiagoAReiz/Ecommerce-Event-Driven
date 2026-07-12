import { Product } from '../../core/entities/product.entity';
import { ProductVariant } from '../../core/entities/product-variant.entity';
import { ProductResponseDto } from '../../adapters/in/dtos/product-response.dto';
import { ProductDetailResponseDto } from '../../adapters/in/dtos/product-detail-response.dto';
import { ProductVariantMapper } from './product-variant.mapper';

export class ProductMapper {
  static toResponse(product: Product): ProductResponseDto {
    return {
      id: product.id,
      sellerId: product.sellerId,
      categoryId: product.categoryId,
      title: product.title,
      description: product.description,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  static toDetailResponse(product: Product, variants: ProductVariant[]): ProductDetailResponseDto {
    return {
      ...this.toResponse(product),
      variants: variants.map((v) => ProductVariantMapper.toResponse(v)),
    };
  }
}
