import { Prisma } from '@prisma/client';
import { SellerRepository } from './seller.repository';
import { Seller } from '../../../core/entities/seller.entity';
import { DuplicateSellerDocumentException } from '../../../core/exceptions/duplicate-seller-document.exception';
import { SellerAlreadyOnboardedException } from '../../../core/exceptions/seller-already-onboarded.exception';

const row = {
  id: 'seller-1',
  userId: 'user-1',
  storeName: 'Loja Teste',
  slug: 'loja-teste-abcd1234',
  document: '12345678900',
  mpCollectorId: 'mp-collector-1',
  status: 'ACTIVE',
  createdAt: new Date('2026-07-10T10:00:00Z'),
  updatedAt: new Date('2026-07-10T10:00:00Z'),
};

function buildRepo() {
  const tx = { seller: { create: jest.fn() }, outboxEvent: { create: jest.fn() } };
  const prisma = {
    seller: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  return { repo: new SellerRepository(prisma), prisma, tx };
}

function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
    meta: { target },
  });
}

describe('SellerRepository', () => {
  it('maps a found row to a Seller entity on findById', async () => {
    const { repo, prisma } = buildRepo();
    prisma.seller.findUnique.mockResolvedValue(row);

    const seller = await repo.findById('seller-1');

    expect(prisma.seller.findUnique).toHaveBeenCalledWith({ where: { id: 'seller-1' } });
    expect(seller).toBeInstanceOf(Seller);
  });

  it('returns null when findByUserId finds nothing', async () => {
    const { repo, prisma } = buildRepo();
    prisma.seller.findUnique.mockResolvedValue(null);

    await expect(repo.findByUserId('missing')).resolves.toBeNull();
    expect(prisma.seller.findUnique).toHaveBeenCalledWith({ where: { userId: 'missing' } });
  });

  it('creates the seller and the outbox event inside the same transaction', async () => {
    const { repo, prisma, tx } = buildRepo();
    tx.seller.create.mockResolvedValue(row);
    tx.outboxEvent.create.mockResolvedValue({});

    const seller = await repo.createWithEvent(
      {
        id: 'seller-1',
        userId: 'user-1',
        storeName: 'Loja Teste',
        slug: 'loja-teste-abcd1234',
        document: '12345678900',
        mpCollectorId: 'mp-collector-1',
        status: 'ACTIVE',
      },
      {
        aggregateType: 'Seller',
        aggregateId: 'seller-1',
        eventType: 'SellerOnboarded',
        payload: { sellerId: 'seller-1' },
      },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'Seller',
        aggregateId: 'seller-1',
        eventType: 'SellerOnboarded',
        payload: { sellerId: 'seller-1' },
      },
    });
    expect(seller).toBeInstanceOf(Seller);
  });

  it('translates a P2002 on the document to DuplicateSellerDocumentException', async () => {
    const { repo, tx } = buildRepo();
    tx.seller.create.mockRejectedValue(p2002(['document']));

    await expect(
      repo.createWithEvent(
        { id: 's', userId: 'u', storeName: 'X', slug: 'x', document: 'dup', mpCollectorId: 'mp', status: 'ACTIVE' },
        { aggregateType: 'Seller', aggregateId: 's', eventType: 'SellerOnboarded', payload: {} },
      ),
    ).rejects.toThrow(DuplicateSellerDocumentException);
  });

  it('translates a P2002 on userId to SellerAlreadyOnboardedException', async () => {
    const { repo, tx } = buildRepo();
    tx.seller.create.mockRejectedValue(p2002(['userId']));

    await expect(
      repo.createWithEvent(
        { id: 's', userId: 'dup-user', storeName: 'X', slug: 'x', document: 'd', mpCollectorId: 'mp', status: 'ACTIVE' },
        { aggregateType: 'Seller', aggregateId: 's', eventType: 'SellerOnboarded', payload: {} },
      ),
    ).rejects.toThrow(SellerAlreadyOnboardedException);
  });

  it('updates storeName/mpCollectorId and maps the result', async () => {
    const { repo, prisma } = buildRepo();
    prisma.seller.update.mockResolvedValue({ ...row, storeName: 'Novo Nome' });

    const seller = await repo.update('seller-1', { storeName: 'Novo Nome' });

    expect(prisma.seller.update).toHaveBeenCalledWith({
      where: { id: 'seller-1' },
      data: { storeName: 'Novo Nome' },
    });
    expect(seller.storeName).toBe('Novo Nome');
  });
});
