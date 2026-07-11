export class ProductVariantResponseDto {
  id!: string;
  productId!: string;
  sku!: string;
  attributes!: Record<string, unknown>;
  price!: number;
  weightGrams!: number;
  heightCm!: number;
  widthCm!: number;
  lengthCm!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
