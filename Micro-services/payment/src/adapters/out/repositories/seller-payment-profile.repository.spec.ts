import { SellerPaymentProfileRepository } from './seller-payment-profile.repository';
import { SellerPaymentProfile } from '../../../core/entities/seller-payment-profile.entity';

function buildRepo() {
  const tx = {
    processedEvent: { findUnique: jest.fn(), create: jest.fn() },
    sellerPaymentProfile: { upsert: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    sellerPaymentProfile: { findUnique: jest.fn(), findMany: jest.fn() },
  } as any;
  return { repo: new SellerPaymentProfileRepository(prisma), prisma, tx };
}

describe('SellerPaymentProfileRepository', () => {
  it('findByUserId maps rows to entities (ownership resolution for /splits)', async () => {
    const { repo, prisma } = buildRepo();
    prisma.sellerPaymentProfile.findMany.mockResolvedValue([
      { sellerId: 'seller-1', userId: 'user-1', mpCollectorId: 'mp-1' },
    ]);

    const result = await repo.findByUserId('user-1');

    expect(prisma.sellerPaymentProfile.findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(result[0]).toBeInstanceOf(SellerPaymentProfile);
    expect(result[0].sellerId).toBe('seller-1');
  });

  it('upsertWithInbox upserts the profile with userId + inbox row atomically', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue(null);

    const processed = await repo.upsertWithInbox('evt-1', 'SellerOnboarded', {
      sellerId: 'seller-1',
      userId: 'user-1',
      mpCollectorId: 'mp-1',
    });

    expect(processed).toBe(true);
    expect(tx.sellerPaymentProfile.upsert).toHaveBeenCalledWith({
      where: { sellerId: 'seller-1' },
      create: { sellerId: 'seller-1', userId: 'user-1', mpCollectorId: 'mp-1' },
      update: { userId: 'user-1', mpCollectorId: 'mp-1' },
    });
    expect(tx.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', eventType: 'SellerOnboarded' },
    });
  });

  it('upsertWithInbox is a no-op on a redelivered eventId', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue({ id: 'p', eventId: 'evt-1' });

    const processed = await repo.upsertWithInbox('evt-1', 'SellerOnboarded', {
      sellerId: 'seller-1',
      userId: 'user-1',
      mpCollectorId: 'mp-1',
    });

    expect(processed).toBe(false);
    expect(tx.sellerPaymentProfile.upsert).not.toHaveBeenCalled();
    expect(tx.processedEvent.create).not.toHaveBeenCalled();
  });
});
