import { ProductVariant } from '../../core/entities/product-variant.entity';
import { ProductVariantResponseDto } from '../../adapters/in/dtos/product-variant-response.dto';

export class ProductVariantMapper {
  static toResponse(variant: ProductVariant): ProductVariantResponseDto {
    return {
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      attributes: variant.attributes,
      // Decimal(12,2) é exato em float, então formatar aqui é preciso; string fixed-2 na saída.
      price: variant.price.toFixed(2),
      weightGrams: variant.weightGrams,
      heightCm: variant.heightCm,
      widthCm: variant.widthCm,
      lengthCm: variant.lengthCm,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    };
  }
}
