import { Injectable } from '@nestjs/common';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';
import {
  CatalogSeller,
  CatalogVariant,
  ICatalogClient,
} from '../../../core/interfaces/external/catalog-client.interface';

interface CatalogSellerResponse {
  id: string;
  status: string;
}

interface CatalogVariantResponse {
  variantId: string;
  sellerId: string;
}

@Injectable()
export class CatalogHttpClient implements ICatalogClient {
  private readonly baseUrl = process.env.CATALOG_SERVICE_URL ?? 'http://localhost:3003/api/v1';

  async getMySeller(accessToken: string): Promise<CatalogSeller | null> {
    const response = await this.get('/sellers/me', accessToken);
    if (response.status === 404) return null;
    if (!response.ok) throw new CatalogUnavailableException();

    const body = (await response.json()) as CatalogSellerResponse;
    return { id: body.id, status: body.status };
  }

  async getVariant(variantId: string, accessToken: string): Promise<CatalogVariant | null> {
    const response = await this.get(`/variants/${variantId}`, accessToken);
    if (response.status === 404) return null;
    if (!response.ok) throw new CatalogUnavailableException();

    const body = (await response.json()) as CatalogVariantResponse;
    return { variantId: body.variantId, sellerId: body.sellerId };
  }

  private async get(path: string, accessToken: string): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new CatalogUnavailableException();
    }
  }
}
