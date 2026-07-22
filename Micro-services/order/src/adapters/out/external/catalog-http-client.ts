import { Injectable } from '@nestjs/common';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';
import {
  CatalogSeller,
  CatalogVariant,
  ICatalogClient,
} from '../../../core/interfaces/external/catalog-client.interface';

interface CatalogVariantResponse {
  variantId: string;
  productId: string;
  sellerId: string;
  title: string;
  sku: string;
  price: string;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  status: string;
}

interface CatalogSellerResponse {
  id: string;
  status: string;
}

@Injectable()
export class CatalogHttpClient implements ICatalogClient {
  private readonly baseUrl = process.env.CATALOG_SERVICE_URL ?? 'http://localhost:3003/api/v1';

  async getVariant(variantId: string, accessToken: string): Promise<CatalogVariant | null> {
    const response = await this.get(`/variants/${variantId}`, accessToken);
    if (response.status === 404) return null;
    if (!response.ok) throw new CatalogUnavailableException();

    const body = (await response.json()) as CatalogVariantResponse;
    return {
      variantId: body.variantId,
      sellerId: body.sellerId,
      title: body.title,
      sku: body.sku,
      price: body.price,
      weightGrams: body.weightGrams,
      heightCm: body.heightCm,
      widthCm: body.widthCm,
      lengthCm: body.lengthCm,
    };
  }

  async getMySeller(accessToken: string): Promise<CatalogSeller | null> {
    const response = await this.get('/sellers/me', accessToken);
    if (response.status === 404) return null;
    if (!response.ok) throw new CatalogUnavailableException();

    const body = (await response.json()) as CatalogSellerResponse;
    return { id: body.id, status: body.status };
  }

  async getProductVariantIds(productId: string, accessToken: string): Promise<string[] | null> {
    const response = await this.get(`/products/${productId}`, accessToken);
    if (response.status === 404) return null;
    if (!response.ok) throw new CatalogUnavailableException();

    const body = (await response.json()) as { variants: { id: string }[] };
    return body.variants.map((v) => v.id);
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
