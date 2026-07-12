import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Product as PrismaProduct,
  ProductVariant as PrismaProductVariant,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Product, ProductStatus } from '../../../core/entities/product.entity';
import { ProductVariant } from '../../../core/entities/product-variant.entity';
import { CategoryNotFoundException } from '../../../core/exceptions/category-not-found.exception';
import {
  CreateProductInput,
  IProductRepository,
  ProductFindManyFilter,
  ProductFindManyResult,
  UpdateProductData,
} from '../../../core/interfaces/repositories/product-repository.interface';
import { CreateOutboxEventInput } from '../../../core/interfaces/repositories/seller-repository.interface';

interface Cursor {
  createdAt: string;
  id: string;
}

@Injectable()
export class ProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findByIdWithVariants(
    id: string,
  ): Promise<{ product: Product; variants: ProductVariant[] } | null> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: { variants: true } });
    if (!row) return null;
    const { variants, ...productRow } = row;
    return {
      product: this.toEntity(productRow),
      variants: variants.map((v) => this.variantToEntity(v)),
    };
  }

  async findMany(filter: ProductFindManyFilter): Promise<ProductFindManyResult> {
    const where: Prisma.ProductWhereInput = {
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.sellerId ? { sellerId: filter.sellerId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.query ? { title: { contains: filter.query, mode: 'insensitive' } } : {}),
      ...(filter.minPrice !== undefined || filter.maxPrice !== undefined
        ? {
            variants: {
              some: {
                price: {
                  ...(filter.minPrice !== undefined ? { gte: filter.minPrice } : {}),
                  ...(filter.maxPrice !== undefined ? { lte: filter.maxPrice } : {}),
                },
              },
            },
          }
        : {}),
      ...(filter.cursor ? this.cursorWhere(filter.cursor) : {}),
    };

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    });

    const hasMore = rows.length > filter.limit;
    const pageRows = hasMore ? rows.slice(0, filter.limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      items: pageRows.map((row) => this.toEntity(row)),
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
    };
  }

  async createWithEvent(product: CreateProductInput, event: CreateOutboxEventInput): Promise<Product> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({ data: product });
        await tx.outboxEvent.create({
          data: {
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
          },
        });
        return created;
      });
      return this.toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new CategoryNotFoundException();
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateProductData): Promise<Product> {
    try {
      const row = await this.prisma.product.update({ where: { id }, data });
      return this.toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new CategoryNotFoundException();
      }
      throw error;
    }
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { status: 'DELETED' } });
  }

  private cursorWhere(cursor: string): Prisma.ProductWhereInput {
    const decoded = this.decodeCursor(cursor);
    return {
      OR: [
        { createdAt: { lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, id: { lt: decoded.id } },
      ],
    };
  }

  private encodeCursor(row: PrismaProduct): string {
    const payload: Cursor = { createdAt: row.createdAt.toISOString(), id: row.id };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Cursor;
    return { createdAt: new Date(decoded.createdAt), id: decoded.id };
  }

  private toEntity(row: PrismaProduct): Product {
    return new Product({
      id: row.id,
      sellerId: row.sellerId,
      categoryId: row.categoryId,
      title: row.title,
      description: row.description,
      status: row.status as ProductStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private variantToEntity(row: PrismaProductVariant): ProductVariant {
    return new ProductVariant({
      id: row.id,
      productId: row.productId,
      sku: row.sku,
      attributes: row.attributes as Record<string, unknown>,
      price: Number(row.price),
      weightGrams: row.weightGrams,
      heightCm: row.heightCm,
      widthCm: row.widthCm,
      lengthCm: row.lengthCm,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
