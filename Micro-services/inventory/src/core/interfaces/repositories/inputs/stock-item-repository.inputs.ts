// Forma de escrita pra inicializar um StockItem (seller cadastra estoque de uma variant).
export interface CreateStockItemInput {
  variantId: string;
  sellerId: string;
  quantity: number;
}
