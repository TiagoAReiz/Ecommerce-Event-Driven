import { VariantDetailMapper } from './variant-detail.mapper';
import { VariantDetail } from '../../core/interfaces/repositories/product-variant-repository.interface';

describe('VariantDetailMapper', () => {
  it('maps the variant detail read model to the response shape, keeping price as a string', () => {
    const detail: VariantDetail = {
      variantId: 'variant-1',
      productId: 'product-1',
      sellerId: 'seller-1',
      title: 'Fone',
      sku: 'SKU-1',
      price: '199.90',
      weightGrams: 250,
      heightCm: 5,
      widthCm: 10,
      lengthCm: 15,
      status: 'ACTIVE',
    };

    const dto = VariantDetailMapper.toResponse(detail);

    expect(dto).toEqual(detail);
    expect(typeof dto.price).toBe('string');
  });
});
