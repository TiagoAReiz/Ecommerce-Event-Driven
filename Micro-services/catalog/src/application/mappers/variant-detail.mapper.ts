import { VariantDetail } from '../../core/interfaces/repositories/product-variant-repository.interface';
import { VariantDetailResponseDto } from '../../adapters/in/dtos/variant-detail-response.dto';

export class VariantDetailMapper {
  static toResponse(detail: VariantDetail): VariantDetailResponseDto {
    return {
      variantId: detail.variantId,
      productId: detail.productId,
      sellerId: detail.sellerId,
      title: detail.title,
      sku: detail.sku,
      price: detail.price,
      weightGrams: detail.weightGrams,
      heightCm: detail.heightCm,
      widthCm: detail.widthCm,
      lengthCm: detail.lengthCm,
      status: detail.status,
    };
  }
}
