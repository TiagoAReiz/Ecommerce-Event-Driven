import { Injectable } from '@nestjs/common';
import { StockItem as PrismaStockItem } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StockItem } from '../../../core/entities/stock-item.entity';
import { IStockItemRepository } from '../../../core/interfaces/repositories/stock-item-repository.interface';
import { CreateStockItemInput } from '../../../core/interfaces/repositories/inputs/stock-item-repository.inputs';

@Injectable()
export class StockItemRepository implements IStockItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByVariantId(variantId: string): Promise<StockItem | null> {
    const row = await this.prisma.stockItem.findUnique({ where: { variantId } });
    return row ? this.toEntity(row) : null;
  }

  async create(input: CreateStockItemInput): Promise<StockItem> {
    const row = await this.prisma.stockItem.create({
      data: {
        variantId: input.variantId,
        sellerId: input.sellerId,
        quantity: input.quantity,
      },
    });
    return this.toEntity(row);
  }

  async updateQuantity(variantId: string, quantity: number): Promise<StockItem> {
    const row = await this.prisma.stockItem.update({
      where: { variantId },
      data: { quantity },
    });
    return this.toEntity(row);
  }

  private toEntity(row: PrismaStockItem): StockItem {
    return new StockItem({
      id: row.id,
      variantId: row.variantId,
      sellerId: row.sellerId,
      quantity: row.quantity,
      reservedQty: row.reservedQty,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
