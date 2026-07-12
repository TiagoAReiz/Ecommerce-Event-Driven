import { SellerEventService } from './seller-event.service';
import { SellerOnboardedPayload } from '../../core/interfaces/services/seller-event.service.interface';

const payload: SellerOnboardedPayload = {
  sellerId: 'seller-1',
  userId: 'user-1',
  storeName: 'Loja',
  document: '12345678000199',
  mpCollectorId: 'mp-1',
};

function build(outcome: any) {
  const userRepository = { promoteToSellerWithInbox: jest.fn().mockResolvedValue(outcome) } as any;
  return { service: new SellerEventService(userRepository), userRepository };
}

describe('SellerEventService', () => {
  it('delegates to the repository with the userId and event type', async () => {
    const { service, userRepository } = build({ outcome: 'PROMOTED', oldRole: 'CUSTOMER' });

    await service.handleSellerOnboarded('evt-1', payload);

    expect(userRepository.promoteToSellerWithInbox).toHaveBeenCalledWith(
      'evt-1',
      'SellerOnboarded',
      'user-1',
    );
  });

  it.each([
    [{ outcome: 'PROMOTED', oldRole: 'CUSTOMER' }],
    [{ outcome: 'ALREADY_SELLER' }],
    [{ outcome: 'DEDUPED' }],
    [{ outcome: 'USER_NOT_FOUND' }],
  ])('handles the %o outcome without throwing', async (outcome) => {
    const { service } = build(outcome);
    await expect(service.handleSellerOnboarded('evt-1', payload)).resolves.toBeUndefined();
  });
});
