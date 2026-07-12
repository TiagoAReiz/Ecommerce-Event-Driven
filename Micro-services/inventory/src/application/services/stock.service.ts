import { Inject, Injectable } from '@nestjs/common';
import { StockItem } from '../../core/entities/stock-item.entity';
import { StockItemNotFoundException } from '../../core/exceptions/stock-item-not-found.exception';
import { StockItemAlreadyExistsException } from '../../core/exceptions/stock-item-already-exists.exception';
import { ForbiddenStockActionException } from '../../core/exceptions/forbidden-stock-action.exception';
import { VariantNotFoundException } from '../../core/exceptions/variant-not-found.exception';
import { SellerNotActiveException } from '../../core/exceptions/seller-not-active.exception';
import { InvalidStockQuantityException } from '../../core/exceptions/invalid-stock-quantity.exception';
import { STOCK_ITEM_REPOSITORY } from '../../core/interfaces/repositories/stock-item-repository.interface';
import type { IStockItemRepository } from '../../core/interfaces/repositories/stock-item-repository.interface';
import { CATALOG_CLIENT } from '../../core/interfaces/external/catalog-client.interface';
import type { CatalogSeller, ICatalogClient } from '../../core/interfaces/external/catalog-client.interface';
import {
  InitStockInput,
  IStockService,
  UpdateStockInput,
} from '../../core/interfaces/services/stock-service.interface';

@Injectable()
export class StockService implements IStockService {
  constructor(
    @Inject(STOCK_ITEM_REPOSITORY) private readonly stockItemRepository: IStockItemRepository,
    @Inject(CATALOG_CLIENT) private readonly catalogClient: ICatalogClient,
  ) {}

  async getByVariantId(variantId: string): Promise<StockItem> {
    // Público (PDP): 404 quando a variant não tem StockItem rastreado.
    const stock = await this.stockItemRepository.findByVariantId(variantId);
    if (!stock) {
      throw new StockItemNotFoundException();
    }
    return stock;
  }

  async initStock(accessToken: string, input: InitStockInput): Promise<StockItem> {
    this.assertValidQuantity(input.quantity);
    const seller = await this.getActiveSellerOrThrow(accessToken);

    // Ownership: a variant precisa pertencer ao seller do usuário logado (checado no catalog).
    const variant = await this.catalogClient.getVariant(input.variantId, accessToken);
    if (!variant) {
      throw new VariantNotFoundException();
    }
    if (variant.sellerId !== seller.id) {
      throw new ForbiddenStockActionException();
    }

    const existing = await this.stockItemRepository.findByVariantId(input.variantId);
    if (existing) {
      throw new StockItemAlreadyExistsException();
    }

    return this.stockItemRepository.create({
      variantId: input.variantId,
      sellerId: seller.id,
      quantity: input.quantity,
    });
  }

  async updateStock(
    accessToken: string,
    variantId: string,
    input: UpdateStockInput,
  ): Promise<StockItem> {
    this.assertValidQuantity(input.quantity);
    const seller = await this.getActiveSellerOrThrow(accessToken);

    const existing = await this.stockItemRepository.findByVariantId(variantId);
    if (!existing) {
      throw new StockItemNotFoundException();
    }
    // Ownership local: `StockItem.sellerId` foi validado contra a variant no init (POST). Como o
    // dono de uma variant é imutável no catalog, comparar aqui é equivalente a rechecar a variant,
    // sem uma segunda chamada síncrona.
    if (existing.sellerId !== seller.id) {
      throw new ForbiddenStockActionException();
    }
    // Não deixa a quantidade total cair abaixo do que já está reservado (evita disponível negativo).
    if (input.quantity < existing.reservedQty) {
      throw new InvalidStockQuantityException(
        'Quantity cannot be lower than the currently reserved amount',
      );
    }

    return this.stockItemRepository.updateQuantity(variantId, input.quantity);
  }

  private async getActiveSellerOrThrow(accessToken: string): Promise<CatalogSeller> {
    const seller = await this.catalogClient.getMySeller(accessToken);
    if (!seller || seller.status !== 'ACTIVE') {
      throw new SellerNotActiveException();
    }
    return seller;
  }

  private assertValidQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new InvalidStockQuantityException('Quantity must be a non-negative integer');
    }
  }
}
