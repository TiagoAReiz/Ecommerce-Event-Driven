// Forma de escrita pra criar/editar uma ProductVariant (id gerado no service). `price` é number
// aqui (usado na comparação de mudança de preço no service); a serialização fixed-2 acontece na saída.
export interface CreateVariantData {
  id: string;
  productId: string;
  sku: string;
  attributes: Record<string, unknown>;
  price: number;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

export interface UpdateVariantData {
  sku?: string;
  attributes?: Record<string, unknown>;
  price?: number;
  weightGrams?: number;
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
}
