import { Product, ProductStatus } from '../../entities/product.entity';
import { ProductVariant } from '../../entities/product-variant.entity';
import { CreateProductInput, UpdateProductData } from './inputs/product-repository.inputs';
import { CreateOutboxEventInput } from './inputs/outbox-event.input';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

export interface ProductFindManyFilter {
  categoryId?: string;
  sellerId?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: ProductStatus;
  cursor?: string;
  limit: number;
}

export interface ProductFindManyResult {
  items: Product[];
  nextCursor: string | null;
}

export interface IProductRepository {
  findById(id: string): Promise<Product | null>;
  findByIdWithVariants(id: string): Promise<{ product: Product; variants: ProductVariant[] } | null>;
  findMany(filter: ProductFindManyFilter): Promise<ProductFindManyResult>;
  /** Creates the Product row + the outbox event row in the same transaction. */
  createWithEvent(product: CreateProductInput, event: CreateOutboxEventInput): Promise<Product>;
  update(id: string, data: UpdateProductData): Promise<Product>;
  softDelete(id: string): Promise<void>;
}
