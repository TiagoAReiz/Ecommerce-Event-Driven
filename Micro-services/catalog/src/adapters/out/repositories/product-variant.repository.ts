import { Injectable } from '@nestjs/common';
import { Prisma, ProductVariant as PrismaProductVariant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ProductVariant } from '../../../core/entities/product-variant.entity';
import { DuplicateSkuException } from '../../../core/exceptions/duplicate-sku.exception';
import { ProductNotFoundException } from '../../../core/exceptions/product-not-found.exception';
import {
  CreateVariantData,
  IProductVariantRepository,
  UpdateVariantData,
  VariantDetail,
} from '../../../core/interfaces/repositories/product-variant-repository.interface';
import { CreateOutboxEventInput } from '../../../core/interfaces/repositories/seller-repository.interface';

@Injectable()
export class ProductVariantRepository implements IProductVariantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProductVariant | null> {
    const row = await this.prisma.productVariant.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findDetailById(id: string): Promise<VariantDetail | null> {
    const row = await this.prisma.productVariant.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!row) return null;
    return {
      variantId: row.id,
      productId: row.productId,
      sellerId: row.product.sellerId,
      title: row.product.title,
      sku: row.sku,
      // Decimal -> fixed-2 string to preserve precision for cart/order snapshots
      // (toFixed(2), not toString(), so trailing zeros aren't dropped: "99.90" not "99.9").
      price: row.price.toFixed(2),
      weightGrams: row.weightGrams,
      heightCm: row.heightCm,
      widthCm: row.widthCm,
      lengthCm: row.lengthCm,
      status: row.product.status,
    };
  }

  async create(data: CreateVariantData): Promise<ProductVariant> {
    try {
      const row = await this.prisma.productVariant.create({
        data: {
          id: data.id,
          productId: data.productId,
          sku: data.sku,
          attributes: data.attributes as Prisma.InputJsonValue,
          price: String(data.price),
          weightGrams: data.weightGrams,
          heightCm: data.heightCm,
          widthCm: data.widthCm,
          lengthCm: data.lengthCm,
        },
      });
      return this.toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new DuplicateSkuException();
        if (error.code === 'P2003') throw new ProductNotFoundException();
      }
      throw error;
    }
  }

  async updateWithOptionalEvent(
    id: string,
    data: UpdateVariantData,
    event: CreateOutboxEventInput | null,
  ): Promise<ProductVariant> {
    const updateData: Prisma.ProductVariantUpdateInput = {
      ...(data.sku !== undefined ? { sku: data.sku } : {}),
      ...(data.attributes !== undefined ? { attributes: data.attributes as Prisma.InputJsonValue } : {}),
      ...(data.price !== undefined ? { price: String(data.price) } : {}),
      ...(data.weightGrams !== undefined ? { weightGrams: data.weightGrams } : {}),
      ...(data.heightCm !== undefined ? { heightCm: data.heightCm } : {}),
      ...(data.widthCm !== undefined ? { widthCm: data.widthCm } : {}),
      ...(data.lengthCm !== undefined ? { lengthCm: data.lengthCm } : {}),
    };

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.productVariant.update({ where: { id }, data: updateData });
        if (event) {
          await tx.outboxEvent.create({
            data: {
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              eventType: event.eventType,
              payload: event.payload as Prisma.InputJsonValue,
            },
          });
        }
        return updated;
      });
      return this.toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateSkuException();
      }
      throw error;
    }
  }

  private toEntity(row: PrismaProductVariant): ProductVariant {
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
