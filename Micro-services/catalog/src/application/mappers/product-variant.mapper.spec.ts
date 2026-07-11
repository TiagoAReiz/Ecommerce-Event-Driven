import { ProductVariantMapper } from './product-variant.mapper';
import { ProductVariant } from '../../core/entities/product-variant.entity';

describe('ProductVariantMapper', () => {
  it('maps a ProductVariant entity to the response shape', () => {
    const variant = new ProductVariant({
      id: 'variant-1',
      productId: 'product-1',
      sku: 'SKU-1',
      attributes: { color: 'Preto' },
      price: 199.9,
      weightGrams: 250,
      heightCm: 5,
      widthCm: 10,
      lengthCm: 15,
      createdAt: new Date('2026-07-10T10:00:00Z'),
      updatedAt: new Date('2026-07-10T10:00:00Z'),
    });

    expect(ProductVariantMapper.toResponse(variant)).toEqual({
      id: 'variant-1',
      productId: 'product-1',
      sku: 'SKU-1',
      attributes: { color: 'Preto' },
      price: 199.9,
      weightGrams: 250,
      heightCm: 5,
      widthCm: 10,
      lengthCm: 15,
      createdAt: new Date('2026-07-10T10:00:00Z'),
      updatedAt: new Date('2026-07-10T10:00:00Z'),
    });
  });
});
