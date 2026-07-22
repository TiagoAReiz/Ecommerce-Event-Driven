import { SellerProfileRepository } from './seller-profile.repository';

function buildTx() {
  return {
    processedEvent: { findUnique: jest.fn(), create: jest.fn() },
    sellerProfile: { upsert: jest.fn(), findUnique: jest.fn() },
  };
}

function buildRepo() {
  const tx = buildTx();
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    sellerProfile: { findUnique: jest.fn() },
  } as any;
  return { repo: new SellerProfileRepository(prisma), prisma, tx };
}

describe('SellerProfileRepository', () => {
  describe('findBySellerId', () => {
    it('returns null when no profile exists', async () => {
      const { repo, prisma } = buildRepo();
      prisma.sellerProfile.findUnique.mockResolvedValue(null);

      await expect(repo.findBySellerId('seller-1')).resolves.toBeNull();
    });

    it('returns the SellerProfile when found', async () => {
      const { repo, prisma } = buildRepo();
      prisma.sellerProfile.findUnique.mockResolvedValue({ sellerId: 'seller-1', userId: 'user-1' });

      const result = await repo.findBySellerId('seller-1');

      expect(result).toEqual({ sellerId: 'seller-1', userId: 'user-1' });
    });
  });

  describe('upsertWithInbox', () => {
    it('no-ops when the eventId was already processed', async () => {
      const { repo, tx } = buildRepo();
      tx.processedEvent.findUnique.mockResolvedValue({ id: 'p', eventId: 'evt-1' });

      const result = await repo.upsertWithInbox('evt-1', 'SellerOnboarded', { sellerId: 'seller-1', userId: 'user-1' });

      expect(result).toBe(false);
      expect(tx.sellerProfile.upsert).not.toHaveBeenCalled();
    });

    it('upserts the profile and records the inbox entry when fresh', async () => {
      const { repo, tx } = buildRepo();
      tx.processedEvent.findUnique.mockResolvedValue(null);

      const result = await repo.upsertWithInbox('evt-1', 'SellerOnboarded', { sellerId: 'seller-1', userId: 'user-1' });

      expect(result).toBe(true);
      expect(tx.sellerProfile.upsert).toHaveBeenCalledWith({
        where: { sellerId: 'seller-1' },
        create: { sellerId: 'seller-1', userId: 'user-1' },
        update: { userId: 'user-1' },
      });
      expect(tx.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-1', eventType: 'SellerOnboarded' },
      });
    });
  });
});
