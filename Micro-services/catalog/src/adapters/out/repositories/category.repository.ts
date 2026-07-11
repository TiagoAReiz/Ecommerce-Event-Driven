import { Injectable } from '@nestjs/common';
import { Category as PrismaCategory } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Category } from '../../../core/entities/category.entity';
import { ICategoryRepository } from '../../../core/interfaces/repositories/category-repository.interface';

@Injectable()
export class CategoryRepository implements ICategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: PrismaCategory): Category {
    return new Category({
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
