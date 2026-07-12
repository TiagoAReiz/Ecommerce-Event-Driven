import { VariantsController } from './variants.controller';
import { ProductVariant } from '../../../core/entities/product-variant.entity';

function buildVariant(): ProductVariant {
  return new ProductVariant({
    id: 'variant-1',
    productId: 'product-1',
    sku: 'SKU-1',
    attributes: {},
    price: 249.9,
    weightGrams: 250,
    heightCm: 5,
    widthCm: 10,
    lengthCm: 15,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('VariantsController', () => {
  it('returns the public variant detail with price as a string', async () => {
    const detail = {
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
    const productService = { getVariantDetail: jest.fn().mockResolvedValue(detail) } as any;
    const controller = new VariantsController(productService);

    const result = await controller.getById('variant-1');

    expect(productService.getVariantDetail).toHaveBeenCalledWith('variant-1');
    expect(result).toEqual(detail);
  });

  it('delegates the update to the product service with the caller id', async () => {
    const productService = { updateVariant: jest.fn().mockResolvedValue(buildVariant()) } as any;
    const controller = new VariantsController(productService);
    const req = { user: { sub: 'user-1' } } as any;

    const result = await controller.update(req, 'variant-1', { price: 249.9 } as any);

    expect(productService.updateVariant).toHaveBeenCalledWith('user-1', 'variant-1', {
      sku: undefined,
      attributes: undefined,
      price: 249.9,
      weightGrams: undefined,
      heightCm: undefined,
      widthCm: undefined,
      lengthCm: undefined,
    });
    expect(result.price).toBe(249.9);
  });
});
