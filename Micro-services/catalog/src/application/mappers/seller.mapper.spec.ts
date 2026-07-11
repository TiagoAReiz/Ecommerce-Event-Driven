import { SellerMapper } from './seller.mapper';
import { Seller } from '../../core/entities/seller.entity';

function buildSeller(): Seller {
  return new Seller({
    id: 'seller-1',
    userId: 'user-1',
    storeName: 'Loja Teste',
    slug: 'loja-teste-abcd1234',
    document: '12345678900',
    mpCollectorId: 'mp-collector-1',
    status: 'ACTIVE',
    createdAt: new Date('2026-07-10T10:00:00Z'),
    updatedAt: new Date('2026-07-10T10:00:00Z'),
  });
}

describe('SellerMapper', () => {
  it('drops document and mpCollectorId on the public response', () => {
    const dto = SellerMapper.toPublicResponse(buildSeller());

    expect(dto).toEqual({
      id: 'seller-1',
      storeName: 'Loja Teste',
      slug: 'loja-teste-abcd1234',
      status: 'ACTIVE',
      createdAt: new Date('2026-07-10T10:00:00Z'),
    });
    expect(dto).not.toHaveProperty('document');
    expect(dto).not.toHaveProperty('mpCollectorId');
    expect(dto).not.toHaveProperty('userId');
  });

  it('includes every field on the /sellers/me response', () => {
    const dto = SellerMapper.toMeResponse(buildSeller());

    expect(dto).toEqual({
      id: 'seller-1',
      userId: 'user-1',
      storeName: 'Loja Teste',
      slug: 'loja-teste-abcd1234',
      document: '12345678900',
      mpCollectorId: 'mp-collector-1',
      status: 'ACTIVE',
      createdAt: new Date('2026-07-10T10:00:00Z'),
      updatedAt: new Date('2026-07-10T10:00:00Z'),
    });
  });
});
