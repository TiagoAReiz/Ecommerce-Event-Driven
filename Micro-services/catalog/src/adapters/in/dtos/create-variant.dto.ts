export class CreateVariantDto {
  sku!: string;
  attributes!: Record<string, unknown>;
  price!: number;
  weightGrams!: number;
  heightCm!: number;
  widthCm!: number;
  lengthCm!: number;
}
