import { BadRequestException } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { Product } from '../../../core/entities/product.entity';
import { ProductVariant } from '../../../core/entities/product-variant.entity';

function buildProduct(): Product {
  return new Product({
    id: 'product-1',
    sellerId: 'seller-1',
    categoryId: 'cat-1',
    title: 'Fone',
    description: 'desc',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
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
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function buildController(overrides: any = {}) {
  const productService = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    createVariant: jest.fn(),
    ...overrides,
  } as any;
  return { controller: new ProductsController(productService), productService };
}

describe('ProductsController', () => {
  it('parses numeric query params on list()', async () => {
    const { controller, productService } = buildController({
      list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    });

    await controller.list('cat-1', 'seller-1', 'fone', '100', '300', 'cursor-x', '5');

    expect(productService.list).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      sellerId: 'seller-1',
      query: 'fone',
      minPrice: 100,
      maxPrice: 300,
      cursor: 'cursor-x',
      limit: 5,
    });
  });

  it('returns the product detail with variants on getById()', async () => {
    const { controller } = buildController({
      getById: jest.fn().mockResolvedValue({ product: buildProduct(), variants: [buildVariant()] }),
    });

    const result = await controller.getById('product-1');

    expect(result.id).toBe('product-1');
    expect(result.variants).toHaveLength(1);
  });

  describe('create', () => {
    it('rejects when required fields are missing', async () => {
      const { controller } = buildController();
      const req = { user: { sub: 'user-1' } } as any;

      await expect(controller.create(req, { title: 'X' } as any)).rejects.toThrow(BadRequestException);
    });

    it('delegates to the service with the caller id', async () => {
      const { controller, productService } = buildController({
        create: jest.fn().mockResolvedValue(buildProduct()),
      });
      const req = { user: { sub: 'user-1' } } as any;
      const body = { categoryId: 'cat-1', title: 'Fone', description: 'desc' };

      await controller.create(req, body as any);

      expect(productService.create).toHaveBeenCalledWith('user-1', body);
    });
  });

  it('delegates update() with the caller id and product id', async () => {
    const { controller, productService } = buildController({
      update: jest.fn().mockResolvedValue(buildProduct()),
    });
    const req = { user: { sub: 'user-1' } } as any;

    await controller.update(req, 'product-1', { title: 'Novo' } as any);

    expect(productService.update).toHaveBeenCalledWith('user-1', 'product-1', {
      categoryId: undefined,
      title: 'Novo',
      description: undefined,
      status: undefined,
    });
  });

  it('delegates remove() (soft-delete) with the caller id and product id', async () => {
    const { controller, productService } = buildController({ softDelete: jest.fn().mockResolvedValue(undefined) });
    const req = { user: { sub: 'user-1' } } as any;

    await controller.remove(req, 'product-1');

    expect(productService.softDelete).toHaveBeenCalledWith('user-1', 'product-1');
  });

  describe('createVariant', () => {
    it('rejects when required fields are missing', async () => {
      const { controller } = buildController();
      const req = { user: { sub: 'user-1' } } as any;

      await expect(controller.createVariant(req, 'product-1', { sku: 'X' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('delegates to the service with defaulted attributes', async () => {
      const { controller, productService } = buildController({
        createVariant: jest.fn().mockResolvedValue(buildVariant()),
      });
      const req = { user: { sub: 'user-1' } } as any;
      const body = { sku: 'SKU-1', price: 199.9, weightGrams: 250, heightCm: 5, widthCm: 10, lengthCm: 15 };

      await controller.createVariant(req, 'product-1', body as any);

      expect(productService.createVariant).toHaveBeenCalledWith('user-1', 'product-1', {
        ...body,
        attributes: {},
      });
    });
  });
});
