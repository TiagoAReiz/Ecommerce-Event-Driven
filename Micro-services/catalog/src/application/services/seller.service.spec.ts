import { SellerService } from './seller.service';
import { Seller } from '../../core/entities/seller.entity';
import { SellerNotFoundException } from '../../core/exceptions/seller-not-found.exception';

function buildSeller(overrides: Partial<Seller> = {}): Seller {
  return new Seller({
    id: 'seller-1',
    userId: 'user-1',
    storeName: 'Loja Teste',
    slug: 'loja-teste-abcd1234',
    document: '12345678900',
    mpCollectorId: 'mp-collector-1',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('SellerService', () => {
  describe('onboard', () => {
    it('creates the seller as ACTIVE with a slug derived from storeName and publishes SellerOnboarded', async () => {
      const sellerRepository = {
        createWithEvent: jest.fn().mockImplementation((seller) => Promise.resolve(buildSeller(seller))),
      } as any;
      const service = new SellerService(sellerRepository);

      const seller = await service.onboard('user-1', {
        storeName: 'Loja Café & Cia',
        document: '12345678900',
        mpCollectorId: 'mp-collector-1',
      });

      expect(sellerRepository.createWithEvent).toHaveBeenCalledTimes(1);
      const [sellerInput, eventInput] = sellerRepository.createWithEvent.mock.calls[0];
      expect(sellerInput.userId).toBe('user-1');
      expect(sellerInput.status).toBe('ACTIVE');
      expect(sellerInput.slug).toMatch(/^loja-caf.*-cia-[a-f0-9]{8}$/);
      expect(eventInput).toEqual({
        aggregateType: 'Seller',
        aggregateId: sellerInput.id,
        eventType: 'SellerOnboarded',
        payload: {
          sellerId: sellerInput.id,
          userId: 'user-1',
          storeName: 'Loja Café & Cia',
          document: '12345678900',
          mpCollectorId: 'mp-collector-1',
        },
      });
      expect(seller.status).toBe('ACTIVE');
    });
  });

  describe('getPublic', () => {
    it('returns the seller when found', async () => {
      const sellerRepository = { findById: jest.fn().mockResolvedValue(buildSeller()) } as any;
      const service = new SellerService(sellerRepository);

      await expect(service.getPublic('seller-1')).resolves.toBeInstanceOf(Seller);
    });

    it('throws SellerNotFoundException when not found', async () => {
      const sellerRepository = { findById: jest.fn().mockResolvedValue(null) } as any;
      const service = new SellerService(sellerRepository);

      await expect(service.getPublic('missing')).rejects.toThrow(SellerNotFoundException);
    });
  });

  describe('getMe', () => {
    it('returns the seller owned by the given userId', async () => {
      const sellerRepository = { findByUserId: jest.fn().mockResolvedValue(buildSeller()) } as any;
      const service = new SellerService(sellerRepository);

      const seller = await service.getMe('user-1');

      expect(sellerRepository.findByUserId).toHaveBeenCalledWith('user-1');
      expect(seller.id).toBe('seller-1');
    });

    it('throws SellerNotFoundException when the user has not onboarded', async () => {
      const sellerRepository = { findByUserId: jest.fn().mockResolvedValue(null) } as any;
      const service = new SellerService(sellerRepository);

      await expect(service.getMe('user-without-seller')).rejects.toThrow(SellerNotFoundException);
    });
  });

  describe('updateMe', () => {
    it('updates the owned seller by id', async () => {
      const sellerRepository = {
        findByUserId: jest.fn().mockResolvedValue(buildSeller()),
        update: jest.fn().mockResolvedValue(buildSeller({ storeName: 'Nova Loja' })),
      } as any;
      const service = new SellerService(sellerRepository);

      const seller = await service.updateMe('user-1', { storeName: 'Nova Loja' });

      expect(sellerRepository.update).toHaveBeenCalledWith('seller-1', {
        storeName: 'Nova Loja',
        mpCollectorId: undefined,
      });
      expect(seller.storeName).toBe('Nova Loja');
    });

    it('throws SellerNotFoundException before attempting the update when not onboarded', async () => {
      const sellerRepository = {
        findByUserId: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      } as any;
      const service = new SellerService(sellerRepository);

      await expect(service.updateMe('user-without-seller', { storeName: 'X' })).rejects.toThrow(
        SellerNotFoundException,
      );
      expect(sellerRepository.update).not.toHaveBeenCalled();
    });
  });
});
