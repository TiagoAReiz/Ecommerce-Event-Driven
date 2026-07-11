import { ProductService } from './product.service';
import { Product } from '../../core/entities/product.entity';
import { ProductVariant } from '../../core/entities/product-variant.entity';
import { Seller } from '../../core/entities/seller.entity';
import { ForbiddenSellerActionException } from '../../core/exceptions/forbidden-seller-action.exception';
import { ProductNotFoundException } from '../../core/exceptions/product-not-found.exception';
import { SellerNotActiveException } from '../../core/exceptions/seller-not-active.exception';
import { SellerNotFoundException } from '../../core/exceptions/seller-not-found.exception';
import { VariantNotFoundException } from '../../core/exceptions/variant-not-found.exception';

function buildSeller(overrides: Partial<Seller> = {}): Seller {
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
    ...overrides,
  });
}

function buildProduct(overrides: Partial<Product> = {}): Product {
  return new Product({
    id: 'product-1',
    sellerId: 'seller-1',
    categoryId: 'cat-1',
    title: 'Fone',
    description: 'Fone bluetooth',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function buildVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
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
    ...overrides,
  });
}

function buildService(overrides: { productRepository?: any; variantRepository?: any; sellerRepository?: any } = {}) {
  const productRepository = {
    findById: jest.fn(),
    findByIdWithVariants: jest.fn(),
    findMany: jest.fn(),
    createWithEvent: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    ...overrides.productRepository,
  };
  const variantRepository = {
    findById: jest.fn(),
    findDetailById: jest.fn(),
    create: jest.fn(),
    updateWithOptionalEvent: jest.fn(),
    ...overrides.variantRepository,
  };
  const sellerRepository = {
    findByUserId: jest.fn(),
    findById: jest.fn(),
    createWithEvent: jest.fn(),
    update: jest.fn(),
    ...overrides.sellerRepository,
  };
  const service = new ProductService(productRepository as any, variantRepository as any, sellerRepository as any);
  return { service, productRepository, variantRepository, sellerRepository };
}

describe('ProductService', () => {
  describe('list', () => {
    it('forces status=ACTIVE and clamps the limit to the max page size', async () => {
      const { service, productRepository } = buildService();
      productRepository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list({ categoryId: 'cat-1', limit: 500 });

      expect(productRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-1', status: 'ACTIVE', limit: 100 }),
      );
    });

    it('defaults to a page size of 20 when no limit is given', async () => {
      const { service, productRepository } = buildService();
      productRepository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list({});

      expect(productRepository.findMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    });
  });

  describe('getById', () => {
    it('returns the product with its variants', async () => {
      const { service, productRepository } = buildService();
      productRepository.findByIdWithVariants.mockResolvedValue({
        product: buildProduct(),
        variants: [buildVariant()],
      });

      const result = await service.getById('product-1');

      expect(result.product.id).toBe('product-1');
      expect(result.variants).toHaveLength(1);
    });

    it('throws ProductNotFoundException when the product does not exist', async () => {
      const { service, productRepository } = buildService();
      productRepository.findByIdWithVariants.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toThrow(ProductNotFoundException);
    });

    it('throws ProductNotFoundException for a soft-deleted product', async () => {
      const { service, productRepository } = buildService();
      productRepository.findByIdWithVariants.mockResolvedValue({
        product: buildProduct({ status: 'DELETED' }),
        variants: [],
      });

      await expect(service.getById('product-1')).rejects.toThrow(ProductNotFoundException);
    });
  });

  describe('getVariantDetail', () => {
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

    it('returns the flattened variant+product detail (price as string)', async () => {
      const { service, variantRepository } = buildService();
      variantRepository.findDetailById.mockResolvedValue(detail);

      const result = await service.getVariantDetail('variant-1');

      expect(variantRepository.findDetailById).toHaveBeenCalledWith('variant-1');
      expect(result).toEqual(detail);
      expect(typeof result.price).toBe('string');
    });

    it('throws VariantNotFoundException when the variant does not exist', async () => {
      const { service, variantRepository } = buildService();
      variantRepository.findDetailById.mockResolvedValue(null);

      await expect(service.getVariantDetail('missing')).rejects.toThrow(VariantNotFoundException);
    });
  });

  describe('create', () => {
    it('creates the product under the caller-owned active seller and publishes ProductCreated', async () => {
      const { service, productRepository, sellerRepository } = buildService();
      sellerRepository.findByUserId.mockResolvedValue(buildSeller());
      productRepository.createWithEvent.mockImplementation((p: any) => Promise.resolve(buildProduct(p)));

      await service.create('user-1', { categoryId: 'cat-1', title: 'Fone', description: 'desc' });

      expect(sellerRepository.findByUserId).toHaveBeenCalledWith('user-1');
      const [productInput, eventInput] = productRepository.createWithEvent.mock.calls[0];
      expect(productInput.sellerId).toBe('seller-1');
      expect(eventInput).toEqual({
        aggregateType: 'Product',
        aggregateId: productInput.id,
        eventType: 'ProductCreated',
        payload: {
          productId: productInput.id,
          sellerId: 'seller-1',
          categoryId: 'cat-1',
          title: 'Fone',
          status: 'ACTIVE',
        },
      });
    });

    it('throws SellerNotFoundException when the caller has not onboarded', async () => {
      const { service, sellerRepository } = buildService();
      sellerRepository.findByUserId.mockResolvedValue(null);

      await expect(
        service.create('user-without-seller', { categoryId: 'cat-1', title: 'X', description: 'Y' }),
      ).rejects.toThrow(SellerNotFoundException);
    });

    it('throws SellerNotActiveException when the seller is suspended', async () => {
      const { service, sellerRepository } = buildService();
      sellerRepository.findByUserId.mockResolvedValue(buildSeller({ status: 'SUSPENDED' }));

      await expect(
        service.create('user-1', { categoryId: 'cat-1', title: 'X', description: 'Y' }),
      ).rejects.toThrow(SellerNotActiveException);
    });
  });

  describe('update / softDelete (ownership)', () => {
    it('updates the product when the caller owns it', async () => {
      const { service, productRepository, sellerRepository } = buildService();
      sellerRepository.findByUserId.mockResolvedValue(buildSeller());
      productRepository.findById.mockResolvedValue(buildProduct());
      productRepository.update.mockResolvedValue(buildProduct({ title: 'Novo titulo' }));

      const updated = await service.update('user-1', 'product-1', { title: 'Novo titulo' });

      expect(productRepository.update).toHaveBeenCalledWith('product-1', {
        categoryId: undefined,
        title: 'Novo titulo',
        description: undefined,
        status: undefined,
      });
      expect(updated.title).toBe('Novo titulo');
    });

    it('throws ForbiddenSellerActionException when the caller does not own the product', async () => {
      const { service, productRepository, sellerRepository } = buildService();
      sellerRepository.findByUserId.mockResolvedValue(buildSeller({ id: 'seller-2' }));
      productRepository.findById.mockResolvedValue(buildProduct({ sellerId: 'seller-1' }));

      await expect(service.update('user-2', 'product-1', { title: 'X' })).rejects.toThrow(
        ForbiddenSellerActionException,
      );
    });

    it('throws ProductNotFoundException when the product does not exist', async () => {
      const { service, productRepository, sellerRepository } = buildService();
      sellerRepository.findByUserId.mockResolvedValue(buildSeller());
      productRepository.findById.mockResolvedValue(null);

      await expect(service.update('user-1', 'missing', { title: 'X' })).rejects.toThrow(
        ProductNotFoundException,
      );
    });

    it('soft-deletes the product when the caller owns it', async () => {
      const { service, productRepository, sellerRepository } = buildService();
      sellerRepository.findByUserId.mockResolvedValue(buildSeller());
      productRepository.findById.mockResolvedValue(buildProduct());

      await service.softDelete('user-1', 'product-1');

      expect(productRepository.softDelete).toHaveBeenCalledWith('product-1');
    });
  });

  describe('createVariant', () => {
    it('creates the variant under the owned product', async () => {
      const { service, productRepository, variantRepository, sellerRepository } = buildService();
      sellerRepository.findByUserId.mockResolvedValue(buildSeller());
      productRepository.findById.mockResolvedValue(buildProduct());
      variantRepository.create.mockResolvedValue(buildVariant());

      await service.createVariant('user-1', 'product-1', {
        sku: 'SKU-1',
        attributes: {},
        price: 199.9,
        weightGrams: 250,
        heightCm: 5,
        widthCm: 10,
        lengthCm: 15,
      });

      expect(variantRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'product-1', sku: 'SKU-1', price: 199.9 }),
      );
    });

    it('throws ForbiddenSellerActionException when the caller does not own the product', async () => {
      const { service, productRepository, sellerRepository } = buildService();
      sellerRepository.findByUserId.mockResolvedValue(buildSeller({ id: 'seller-2' }));
      productRepository.findById.mockResolvedValue(buildProduct({ sellerId: 'seller-1' }));

      await expect(
        service.createVariant('user-2', 'product-1', {
          sku: 'X',
          attributes: {},
          price: 1,
          weightGrams: 1,
          heightCm: 1,
          widthCm: 1,
          lengthCm: 1,
        }),
      ).rejects.toThrow(ForbiddenSellerActionException);
    });
  });

  describe('updateVariant', () => {
    it('publishes ProductVariantPriceChanged when the price changes', async () => {
      const { service, productRepository, variantRepository, sellerRepository } = buildService();
      variantRepository.findById.mockResolvedValue(buildVariant({ price: 199.9 }));
      sellerRepository.findByUserId.mockResolvedValue(buildSeller());
      productRepository.findById.mockResolvedValue(buildProduct());
      variantRepository.updateWithOptionalEvent.mockResolvedValue(buildVariant({ price: 249.9 }));

      await service.updateVariant('user-1', 'variant-1', { price: 249.9 });

      expect(variantRepository.updateWithOptionalEvent).toHaveBeenCalledWith(
        'variant-1',
        expect.objectContaining({ price: 249.9 }),
        {
          aggregateType: 'ProductVariant',
          aggregateId: 'variant-1',
          eventType: 'ProductVariantPriceChanged',
          payload: { variantId: 'variant-1', productId: 'product-1', oldPrice: 199.9, newPrice: 249.9 },
        },
      );
    });

    it('does not publish an event when the price is unchanged (float noise included)', async () => {
      const { service, productRepository, variantRepository, sellerRepository } = buildService();
      variantRepository.findById.mockResolvedValue(buildVariant({ price: 199.9 }));
      sellerRepository.findByUserId.mockResolvedValue(buildSeller());
      productRepository.findById.mockResolvedValue(buildProduct());
      variantRepository.updateWithOptionalEvent.mockResolvedValue(buildVariant({ price: 199.9 }));

      await service.updateVariant('user-1', 'variant-1', { price: 199.9, sku: 'SKU-1-NEW' });

      expect(variantRepository.updateWithOptionalEvent).toHaveBeenCalledWith(
        'variant-1',
        expect.objectContaining({ sku: 'SKU-1-NEW' }),
        null,
      );
    });

    it('does not publish an event when price is omitted from the update', async () => {
      const { service, productRepository, variantRepository, sellerRepository } = buildService();
      variantRepository.findById.mockResolvedValue(buildVariant({ price: 199.9 }));
      sellerRepository.findByUserId.mockResolvedValue(buildSeller());
      productRepository.findById.mockResolvedValue(buildProduct());
      variantRepository.updateWithOptionalEvent.mockResolvedValue(buildVariant());

      await service.updateVariant('user-1', 'variant-1', { sku: 'SKU-1-NEW' });

      expect(variantRepository.updateWithOptionalEvent).toHaveBeenCalledWith(
        'variant-1',
        expect.anything(),
        null,
      );
    });

    it('throws VariantNotFoundException when the variant does not exist', async () => {
      const { service, variantRepository } = buildService();
      variantRepository.findById.mockResolvedValue(null);

      await expect(service.updateVariant('user-1', 'missing', { price: 1 })).rejects.toThrow(
        VariantNotFoundException,
      );
    });

    it('throws ForbiddenSellerActionException when the caller does not own the parent product', async () => {
      const { service, productRepository, variantRepository, sellerRepository } = buildService();
      variantRepository.findById.mockResolvedValue(buildVariant());
      sellerRepository.findByUserId.mockResolvedValue(buildSeller({ id: 'seller-2' }));
      productRepository.findById.mockResolvedValue(buildProduct({ sellerId: 'seller-1' }));

      await expect(service.updateVariant('user-2', 'variant-1', { price: 1 })).rejects.toThrow(
        ForbiddenSellerActionException,
      );
    });
  });
});
