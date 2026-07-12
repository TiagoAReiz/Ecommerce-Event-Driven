import { ProductVariant } from '../../entities/product-variant.entity';
import { CreateVariantData, UpdateVariantData } from './inputs/product-variant-repository.inputs';
import { CreateOutboxEventInput } from './inputs/outbox-event.input';

export const PRODUCT_VARIANT_REPOSITORY = Symbol('PRODUCT_VARIANT_REPOSITORY');

/**
 * Read model for `GET /variants/:id` — the variant joined with its parent
 * Product (sellerId/title/status flattened in). `price` stays a STRING so the
 * Decimal precision survives the trip to cart/order (never a float).
 */
export interface VariantDetail {
  variantId: string;
  productId: string;
  sellerId: string;
  title: string;
  sku: string;
  price: string;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  status: string;
}

export interface IProductVariantRepository {
  findById(id: string): Promise<ProductVariant | null>;
  /** Variant + parent Product join, price serialized as string. Null when the variant does not exist. */
  findDetailById(id: string): Promise<VariantDetail | null>;
  create(data: CreateVariantData): Promise<ProductVariant>;
  /**
   * Updates the variant. When `event` is provided (price changed), writes the
   * outbox event row in the same transaction as the update.
   */
  updateWithOptionalEvent(
    id: string,
    data: UpdateVariantData,
    event: CreateOutboxEventInput | null,
  ): Promise<ProductVariant>;
}
