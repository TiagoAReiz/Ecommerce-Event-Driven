import { Product } from '../../entities/product.entity';
import { ProductVariant } from '../../entities/product-variant.entity';
import { VariantDetail } from '../repositories/product-variant-repository.interface';

export const PRODUCT_SERVICE = Symbol('PRODUCT_SERVICE');

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ProductListFilter {
  categoryId?: string;
  sellerId?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  cursor?: string;
  limit?: number;
}

export interface ProductWithVariants {
  product: Product;
  variants: ProductVariant[];
}

export interface CreateProductInput {
  categoryId: string;
  title: string;
  description: string;
}

export interface UpdateProductInput {
  categoryId?: string;
  title?: string;
  description?: string;
  status?: 'ACTIVE' | 'PAUSED';
}

export interface CreateVariantInput {
  sku: string;
  attributes: Record<string, unknown>;
  price: number;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

export interface UpdateVariantInput {
  sku?: string;
  attributes?: Record<string, unknown>;
  price?: number;
  weightGrams?: number;
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
}

export interface IProductService {
  /** Public listing — only ACTIVE products, cursor-paginated. */
  list(filter: ProductListFilter): Promise<PaginatedResult<Product>>;
  /** Public detail — 404s on DELETED (soft-deleted) products. */
  getById(productId: string): Promise<ProductWithVariants>;
  create(userId: string, input: CreateProductInput): Promise<Product>;
  update(userId: string, productId: string, input: UpdateProductInput): Promise<Product>;
  softDelete(userId: string, productId: string): Promise<void>;
  createVariant(userId: string, productId: string, input: CreateVariantInput): Promise<ProductVariant>;
  updateVariant(userId: string, variantId: string, input: UpdateVariantInput): Promise<ProductVariant>;
  /** Public variant detail (variant + parent product flattened) for cart/order checkout. */
  getVariantDetail(variantId: string): Promise<VariantDetail>;
}
