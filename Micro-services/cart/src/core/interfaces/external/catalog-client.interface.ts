export const CATALOG_CLIENT = Symbol('CATALOG_CLIENT');

export interface CatalogVariant {
  variantId: string;
  sellerId: string;
  /** Decimal do catalog-service serializado como string, pra não perder precisão (nunca float). */
  price: string;
}

export interface ICatalogClient {
  /**
   * Busca preço/sellerId atuais de uma variant no catalog-service (chamada HTTP síncrona,
   * repassando o JWT do usuário). Retorna `null` quando a variant não existe (404 do catalog).
   */
  getVariant(variantId: string, accessToken: string): Promise<CatalogVariant | null>;
}
