import { Injectable } from '@nestjs/common';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';
import { CatalogVariant, ICatalogClient } from '../../../core/interfaces/external/catalog-client.interface';

/**
 * Shape esperado da resposta do catalog-service pra uma variant.
 *
 * ASSUNÇÃO (desvio documentado): o spec de endpoints só lista `PATCH /api/v1/variants/:id`,
 * sem um GET equivalente pra leitura pontual de uma variant. Assumimos que
 * `GET /api/v1/variants/:id` existe espelhando o PATCH (mesmo recurso, mesma rota base) e
 * retorna pelo menos `{ id, sellerId, price }`. O order-service também precisa dessa mesma
 * chamada síncrona (spec, seção `POST /orders`), então essa suposição é compartilhada — vale
 * confirmar com quem implementa o catalog-service.
 */
interface CatalogVariantResponse {
  id: string;
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
      variantId: body.id,
      sellerId: body.sellerId,
      price: String(body.price),
    };
  }
}
