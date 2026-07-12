// Forma de escrita de um item do carrinho (upsert por variant). `unitPriceSnapshot` é string
// (Decimal serializado, nunca float).
export interface UpsertCartItemInput {
  variantId: string;
  sellerId: string;
  quantity: number;
  unitPriceSnapshot: string;
}
