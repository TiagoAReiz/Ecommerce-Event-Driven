import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Product } from '../../core/entities/product.entity';
import { ProductVariant } from '../../core/entities/product-variant.entity';
import { ForbiddenSellerActionException } from '../../core/exceptions/forbidden-seller-action.exception';
import { ProductNotFoundException } from '../../core/exceptions/product-not-found.exception';
import { SellerNotActiveException } from '../../core/exceptions/seller-not-active.exception';
import { SellerNotFoundException } from '../../core/exceptions/seller-not-found.exception';
import { VariantNotFoundException } from '../../core/exceptions/variant-not-found.exception';
import { PRODUCT_REPOSITORY } from '../../core/interfaces/repositories/product-repository.interface';
import type { IProductRepository } from '../../core/interfaces/repositories/product-repository.interface';
import { PRODUCT_VARIANT_REPOSITORY } from '../../core/interfaces/repositories/product-variant-repository.interface';
import type {
  IProductVariantRepository,
  VariantDetail,
} from '../../core/interfaces/repositories/product-variant-repository.interface';
import { SELLER_REPOSITORY } from '../../core/interfaces/repositories/seller-repository.interface';
import type { ISellerRepository } from '../../core/interfaces/repositories/seller-repository.interface';
import type {
  CreateProductInput,
  CreateVariantInput,
  IProductService,
  PaginatedResult,
  ProductListFilter,
  ProductWithVariants,
  UpdateProductInput,
  UpdateVariantInput,
} from '../../core/interfaces/services/product-service.interface';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

@Injectable()
export class ProductService implements IProductService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY)
    private readonly variantRepository: IProductVariantRepository,
    @Inject(SELLER_REPOSITORY) private readonly sellerRepository: ISellerRepository,
  ) {}

  async list(filter: ProductListFilter): Promise<PaginatedResult<Product>> {
    const limit = Math.min(filter.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    return this.productRepository.findMany({
      categoryId: filter.categoryId,
      sellerId: filter.sellerId,
      query: filter.query,
      minPrice: filter.minPrice,
      maxPrice: filter.maxPrice,
      status: 'ACTIVE',
      cursor: filter.cursor,
      limit,
    });
  }

  async getById(productId: string): Promise<ProductWithVariants> {
    const found = await this.productRepository.findByIdWithVariants(productId);
    if (!found || found.product.status === 'DELETED') {
      throw new ProductNotFoundException();
    }
    return found;
  }

  async getVariantDetail(variantId: string): Promise<VariantDetail> {
    // Público: 404 só quando a variant não existe. Não filtramos por status —
    // o `status` vai no payload pro cart/order decidirem se rejeitam inativo.
    const detail = await this.variantRepository.findDetailById(variantId);
    if (!detail) {
      throw new VariantNotFoundException();
    }
    return detail;
  }

  async create(userId: string, input: CreateProductInput): Promise<Product> {
    const seller = await this.getActiveSellerOrThrow(userId);
    const id = randomUUID();

    return this.productRepository.createWithEvent(
      {
        id,
        sellerId: seller.id,
        categoryId: input.categoryId,
        title: input.title,
        description: input.description,
      },
      {
        aggregateType: 'Product',
        aggregateId: id,
        eventType: 'ProductCreated',
        payload: {
          productId: id,
          sellerId: seller.id,
          categoryId: input.categoryId,
          title: input.title,
          status: 'ACTIVE',
        },
      },
    );
  }

  async update(userId: string, productId: string, input: UpdateProductInput): Promise<Product> {
    const product = await this.getOwnedProductOrThrow(userId, productId);
    return this.productRepository.update(product.id, {
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      status: input.status,
    });
  }

  async softDelete(userId: string, productId: string): Promise<void> {
    const product = await this.getOwnedProductOrThrow(userId, productId);
    await this.productRepository.softDelete(product.id);
  }

  async createVariant(
    userId: string,
    productId: string,
    input: CreateVariantInput,
  ): Promise<ProductVariant> {
    const product = await this.getOwnedProductOrThrow(userId, productId);
    const id = randomUUID();

    return this.variantRepository.create({
      id,
      productId: product.id,
      sku: input.sku,
      attributes: input.attributes,
      price: input.price,
      weightGrams: input.weightGrams,
      heightCm: input.heightCm,
      widthCm: input.widthCm,
      lengthCm: input.lengthCm,
    });
  }

  async updateVariant(
    userId: string,
    variantId: string,
    input: UpdateVariantInput,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepository.findById(variantId);
    if (!variant) {
      throw new VariantNotFoundException();
    }
    // Ownership check goes through the parent product's seller (variants carry no sellerId of their own).
    await this.getOwnedProductOrThrow(userId, variant.productId);

    const priceChanged = input.price !== undefined && this.centsOf(input.price) !== this.centsOf(variant.price);

    return this.variantRepository.updateWithOptionalEvent(
      variantId,
      {
        sku: input.sku,
        attributes: input.attributes,
        price: input.price,
        weightGrams: input.weightGrams,
        heightCm: input.heightCm,
        widthCm: input.widthCm,
        lengthCm: input.lengthCm,
      },
      priceChanged
        ? {
            aggregateType: 'ProductVariant',
            aggregateId: variantId,
            eventType: 'ProductVariantPriceChanged',
            payload: {
              variantId,
              productId: variant.productId,
              oldPrice: variant.price,
              newPrice: input.price,
            },
          }
        : null,
    );
  }

  private async getActiveSellerOrThrow(userId: string) {
    const seller = await this.sellerRepository.findByUserId(userId);
    if (!seller) {
      throw new SellerNotFoundException();
    }
    if (seller.status !== 'ACTIVE') {
      throw new SellerNotActiveException();
    }
    return seller;
  }

  private async getOwnedProductOrThrow(userId: string, productId: string): Promise<Product> {
    const seller = await this.getActiveSellerOrThrow(userId);
    const product = await this.productRepository.findById(productId);
    if (!product || product.status === 'DELETED') {
      throw new ProductNotFoundException();
    }
    if (product.sellerId !== seller.id) {
      throw new ForbiddenSellerActionException();
    }
    return product;
  }

  // Compara em centavos pra evitar falso-positivo de mudança por ponto-flutuante
  // (ex.: 199.9 vindo do DB vs. 199.90 vindo do request).
  private centsOf(price: number): number {
    return Math.round(price * 100);
  }
}
