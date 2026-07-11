// Detalhe de variant achatado com dados do Product pai (sellerId/title/status).
// `price` é STRING (Decimal serializado) pra cart/order não perderem precisão.
export class VariantDetailResponseDto {
  variantId!: string;
  productId!: string;
  sellerId!: string;
  title!: string;
  sku!: string;
  price!: string;
  weightGrams!: number;
  heightCm!: number;
  widthCm!: number;
  lengthCm!: number;
  status!: string;
}
