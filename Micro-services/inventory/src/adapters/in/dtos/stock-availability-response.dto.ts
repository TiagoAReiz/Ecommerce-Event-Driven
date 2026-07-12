// Resposta pública de `GET /stock/:variantId` (PDP). `available = quantity - reservedQty`.
export class StockAvailabilityResponseDto {
  variantId!: string;
  available!: number;
  quantity!: number;
  reservedQty!: number;
}
