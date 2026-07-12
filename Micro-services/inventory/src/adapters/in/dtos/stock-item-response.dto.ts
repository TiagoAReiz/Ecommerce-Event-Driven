// Resposta de escrita (`POST /stock`, `PATCH /stock/:variantId`) — inclui o dono e os totais.
export class StockItemResponseDto {
  id!: string;
  variantId!: string;
  sellerId!: string;
  quantity!: number;
  reservedQty!: number;
  available!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
