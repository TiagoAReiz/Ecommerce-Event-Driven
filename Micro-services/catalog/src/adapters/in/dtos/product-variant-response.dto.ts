export class ProductVariantResponseDto {
  id!: string;
  productId!: string;
  sku!: string;
  attributes!: Record<string, unknown>;
  // Money serializado como string fixed-2 (ver convenção de dinheiro) — nunca float.
  price!: string;
  weightGrams!: number;
  heightCm!: number;
  widthCm!: number;
  lengthCm!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
