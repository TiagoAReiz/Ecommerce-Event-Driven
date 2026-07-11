export class UpdateVariantDto {
  sku?: string;
  attributes?: Record<string, unknown>;
  price?: number;
  weightGrams?: number;
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
}
