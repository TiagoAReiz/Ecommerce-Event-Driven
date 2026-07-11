import { AddressService } from './address.service';
import { Address, AddressOwnerType } from '../../core/entities/address.entity';
import { AddressNotFoundException } from '../../core/exceptions/address-not-found.exception';
import { AddressAccessDeniedException } from '../../core/exceptions/address-access-denied.exception';
import { SellerAddressForbiddenException } from '../../core/exceptions/seller-address-forbidden.exception';
import { CallerContext } from '../../core/interfaces/services/address-service.interface';

function makeAddress(overrides: Partial<Address> = {}): Address {
  return new Address({
    id: 'addr-1',
    ownerType: 'CUSTOMER',
    ownerId: 'user-1',
    cep: '01310100',
    street: 'Rua X',
    number: '10',
    complement: null,
    neighborhood: 'Centro',
    city: 'SP',
    state: 'SP',
    country: 'BR',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function buildService() {
  const addressRepository = {
    create: jest.fn((data) => Promise.resolve(makeAddress(data))),
    findById: jest.fn(),
    listByOwner: jest.fn().mockResolvedValue([]),
    update: jest.fn((id, data) => Promise.resolve(makeAddress({ id, ...data }))),
    delete: jest.fn().mockResolvedValue(undefined),
    findSellerOrigin: jest.fn(),
  } as any;
  const service = new AddressService(addressRepository);
  return { service, addressRepository };
}

const customer: CallerContext = { userId: 'user-1', role: 'CUSTOMER' };
const seller: CallerContext = { userId: 'user-9', role: 'SELLER' };

const baseInput = {
  cep: '01310100',
  street: 'Rua X',
  number: '10',
  neighborhood: 'Centro',
  city: 'SP',
  state: 'SP',
};

describe('AddressService.create', () => {
  it('forces ownerId to the caller userId for CUSTOMER addresses (ignores any supplied ownerId)', async () => {
    const { service, addressRepository } = buildService();
    await service.create(customer, { ownerType: 'CUSTOMER', ownerId: 'attacker', ...baseInput });
    expect(addressRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerType: 'CUSTOMER', ownerId: 'user-1' }),
    );
  });

  it('stores the supplied sellerId as ownerId for SELLER addresses when the caller is a SELLER', async () => {
    const { service, addressRepository } = buildService();
    await service.create(seller, { ownerType: 'SELLER', ownerId: 'seller-1', ...baseInput });
    expect(addressRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerType: 'SELLER', ownerId: 'seller-1' }),
    );
  });

  it('rejects creating a SELLER address when the caller is not a SELLER', async () => {
    const { service } = buildService();
    await expect(
      service.create(customer, { ownerType: 'SELLER', ownerId: 'seller-1', ...baseInput }),
    ).rejects.toThrow(SellerAddressForbiddenException);
  });
});

describe('AddressService.getById ownership', () => {
  it('throws AddressNotFound when the address does not exist', async () => {
    const { service, addressRepository } = buildService();
    addressRepository.findById.mockResolvedValue(null);
    await expect(service.getById(customer, 'missing')).rejects.toThrow(AddressNotFoundException);
  });

  it('denies access to a CUSTOMER address owned by another user', async () => {
    const { service, addressRepository } = buildService();
    addressRepository.findById.mockResolvedValue(makeAddress({ ownerId: 'someone-else' }));
    await expect(service.getById(customer, 'addr-1')).rejects.toThrow(AddressAccessDeniedException);
  });

  it('allows the owner to read their own CUSTOMER address', async () => {
    const { service, addressRepository } = buildService();
    addressRepository.findById.mockResolvedValue(makeAddress({ ownerId: 'user-1' }));
    await expect(service.getById(customer, 'addr-1')).resolves.toBeDefined();
  });

  it('denies a non-SELLER caller from reading a SELLER address (trust-gap gate)', async () => {
    const { service, addressRepository } = buildService();
    addressRepository.findById.mockResolvedValue(
      makeAddress({ ownerType: 'SELLER', ownerId: 'seller-1' }),
    );
    await expect(service.getById(customer, 'addr-1')).rejects.toThrow(AddressAccessDeniedException);
  });
});

describe('AddressService.list', () => {
  it('lists the caller own CUSTOMER addresses by default', async () => {
    const { service, addressRepository } = buildService();
    await service.list(customer, {});
    expect(addressRepository.listByOwner).toHaveBeenCalledWith('CUSTOMER', 'user-1');
  });

  it('lists SELLER addresses by supplied sellerId when the caller is a SELLER', async () => {
    const { service, addressRepository } = buildService();
    const ownerType: AddressOwnerType = 'SELLER';
    await service.list(seller, { ownerType, ownerId: 'seller-1' });
    expect(addressRepository.listByOwner).toHaveBeenCalledWith('SELLER', 'seller-1');
  });
});
