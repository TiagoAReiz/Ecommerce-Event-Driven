import { CategoryRepository } from './category.repository';
import { Category } from '../../../core/entities/category.entity';

function buildRepo() {
  const prisma = { category: { findMany: jest.fn() } } as any;
  return { repo: new CategoryRepository(prisma), prisma };
}

const row = {
  id: 'cat-1',
  name: 'Eletronicos',
  slug: 'eletronicos',
  createdAt: new Date('2026-07-10T10:00:00Z'),
  updatedAt: new Date('2026-07-10T10:00:00Z'),
};

describe('CategoryRepository', () => {
  it('lists all categories ordered by name, mapped to entities', async () => {
    const { repo, prisma } = buildRepo();
    prisma.category.findMany.mockResolvedValue([row]);

    const categories = await repo.findAll();

    expect(prisma.category.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    expect(categories).toHaveLength(1);
    expect(categories[0]).toBeInstanceOf(Category);
  });
});
