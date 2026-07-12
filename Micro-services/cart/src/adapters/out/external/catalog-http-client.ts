import { Injectable } from '@nestjs/common';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';
import { CatalogVariant, ICatalogClient } from '../../../core/interfaces/external/catalog-client.interface';

/**
 * Shape da resposta de `GET /api/v1/variants/:id` do catalog-service (variant-detail): achata
 * dados do Product pai e serializa `price` como string fixed-2. Só usamos `variantId`, `sellerId`
 * e `price` aqui; os demais campos (sku, title, weight/dimensões) são pro order-service.
 */
interface CatalogVariantResponse {
  variantId: string;
  sellerId: string;
  price: string | number;
}

@Injectable()
export class CatalogHttpClient implements ICatalogClient {
  private readonly baseUrl = process.env.CATALOG_SERVICE_URL ?? 'http://localhost:3003/api/v1';

  async getVariant(variantId: string, accessToken: string): Promise<CatalogVariant | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/variants/${variantId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new CatalogUnavailableException();
    }

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new CatalogUnavailableException();
    }

    const body = (await response.json()) as CatalogVariantResponse;
    return {
      variantId: body.variantId,
      sellerId: body.sellerId,
      price: String(body.price),
    };
  }
}
