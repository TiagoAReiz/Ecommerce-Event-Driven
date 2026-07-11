import { BadRequestException } from '@nestjs/common';
import { SellersController } from './sellers.controller';
import { Seller } from '../../../core/entities/seller.entity';
import { Product } from '../../../core/entities/product.entity';

function buildSeller(): Seller {
  return new Seller({
    id: 'seller-1',
    userId: 'user-1',
    storeName: 'Loja',
    slug: 'loja-abcd1234',
    document: 'doc',
    mpCollectorId: 'mp',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function buildController(sellerOverrides: any = {}, productOverrides: any = {}) {
  const sellerService = {
    onboard: jest.fn(),
    getPublic: jest.fn(),
    getMe: jest.fn(),
    updateMe: jest.fn(),
    ...sellerOverrides,
  } as any;
  const productService = { list: jest.fn(), ...productOverrides } as any;
  return { controller: new SellersController(sellerService, productService), sellerService, productService };
}

describe('SellersController', () => {
  describe('onboard', () => {
    it('rejects when required fields are missing', async () => {
      const { controller } = buildController();
      const req = { user: { sub: 'user-1' } } as any;

      await expect(controller.onboard(req, { storeName: 'X' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('onboards the caller and returns the /sellers/me shape', async () => {
      const { controller, sellerService } = buildController({
        onboard: jest.fn().mockResolvedValue(buildSeller()),
      });
      const req = { user: { sub: 'user-1' } } as any;
      const body = { storeName: 'Loja', document: 'doc', mpCollectorId: 'mp' };

      const result = await controller.onboard(req, body as any);

      expect(sellerService.onboard).toHaveBeenCalledWith('user-1', body);
      expect(result.id).toBe('seller-1');
      expect(result.document).toBe('doc');
    });
  });

  describe('getMe / updateMe', () => {
    it('returns the caller-owned seller', async () => {
      const { controller, sellerService } = buildController({
        getMe: jest.fn().mockResolvedValue(buildSeller()),
      });
      const req = { user: { sub: 'user-1' } } as any;

      const result = await controller.getMe(req);

      expect(sellerService.getMe).toHaveBeenCalledWith('user-1');
      expect(result.id).toBe('seller-1');
    });

    it('updates the caller-owned seller', async () => {
      const { controller, sellerService } = buildController({
        updateMe: jest.fn().mockResolvedValue(buildSeller()),
      });
      const req = { user: { sub: 'user-1' } } as any;

      await controller.updateMe(req, { storeName: 'Nova Loja' } as any);

      expect(sellerService.updateMe).toHaveBeenCalledWith('user-1', {
        storeName: 'Nova Loja',
        mpCollectorId: undefined,
      });
    });
  });

  describe('getPublic', () => {
    it('drops document/mpCollectorId from the public response', async () => {
      const { controller } = buildController({ getPublic: jest.fn().mockResolvedValue(buildSeller()) });

      const result = await controller.getPublic('seller-1');

      expect(result).not.toHaveProperty('document');
      expect(result).not.toHaveProperty('mpCollectorId');
    });
  });

  describe('listProducts', () => {
    it('scopes the product listing to the given seller id and parses the limit', async () => {
      const { controller, productService } = buildController(
        {},
        {
          list: jest.fn().mockResolvedValue({
            items: [
              new Product({
                id: 'product-1',
                sellerId: 'seller-1',
                categoryId: 'cat-1',
                title: 'Fone',
                description: 'desc',
                status: 'ACTIVE',
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
            ],
            nextCursor: null,
          }),
        },
      );

      const result = await controller.listProducts('seller-1', 'cursor-abc', '10');

      expect(productService.list).toHaveBeenCalledWith({
        sellerId: 'seller-1',
        cursor: 'cursor-abc',
        limit: 10,
      });
      expect(result.items).toHaveLength(1);
    });
  });
});
