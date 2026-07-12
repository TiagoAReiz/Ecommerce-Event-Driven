import { ProductMapper } from './product.mapper';
import { Product } from '../../core/entities/product.entity';
import { ProductVariant } from '../../core/entities/product-variant.entity';

function buildProduct(): Product {
  return new Product({
    id: 'product-1',
    sellerId: 'seller-1',
    categoryId: 'cat-1',
    title: 'Fone de ouvido',
    description: 'Fone bluetooth',
    status: 'ACTIVE',
    createdAt: new Date('2026-07-10T10:00:00Z'),
    updatedAt: new Date('2026-07-10T10:00:00Z'),
  });
}

function buildVariant(): ProductVariant {
  return new ProductVariant({
    id: 'variant-1',
    productId: 'product-1',
    sku: 'SKU-1',
    attributes: {},
    price: 199.9,
    weightGrams: 250,
    heightCm: 5,
    widthCm: 10,
    lengthCm: 15,
    createdAt: new Date('2026-07-10T10:00:00Z'),
    updatedAt: new Date('2026-07-10T10:00:00Z'),
  });
}

describe('ProductMapper', () => {
  it('maps a Product entity to the response shape', () => {
    expect(ProductMapper.toResponse(buildProduct())).toEqual({
      id: 'product-1',
      sellerId: 'seller-1',
      categoryId: 'cat-1',
      title: 'Fone de ouvido',
      description: 'Fone bluetooth',
      status: 'ACTIVE',
      createdAt: new Date('2026-07-10T10:00:00Z'),
      updatedAt: new Date('2026-07-10T10:00:00Z'),
    });
  });

  it('embeds mapped variants on the detail response', () => {
    const dto = ProductMapper.toDetailResponse(buildProduct(), [buildVariant()]);

    expect(dto.variants).toHaveLength(1);
    expect(dto.variants[0]).toEqual({
      id: 'variant-1',
      productId: 'product-1',
      sku: 'SKU-1',
      attributes: {},
      price: '199.90',
      weightGrams: 250,
      heightCm: 5,
      widthCm: 10,
      lengthCm: 15,
      createdAt: new Date('2026-07-10T10:00:00Z'),
      updatedAt: new Date('2026-07-10T10:00:00Z'),
    });
    expect(dto.id).toBe('product-1');
  });
});
