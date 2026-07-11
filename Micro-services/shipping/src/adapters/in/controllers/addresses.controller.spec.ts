import { BadRequestException } from '@nestjs/common';
import { AddressesController } from './addresses.controller';
import { Address } from '../../../core/entities/address.entity';

function makeAddress(): Address {
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
  });
}

function req(role = 'CUSTOMER') {
  return { user: { sub: 'user-1', email: 'a@b.com', role }, headers: {} } as any;
}

function buildController() {
  const addressService = {
    create: jest.fn().mockResolvedValue(makeAddress()),
    list: jest.fn().mockResolvedValue([makeAddress()]),
    getById: jest.fn().mockResolvedValue(makeAddress()),
    update: jest.fn().mockResolvedValue(makeAddress()),
    delete: jest.fn().mockResolvedValue(undefined),
  } as any;
  const controller = new AddressesController(addressService);
  return { controller, addressService };
}

const validBody = {
  cep: '01310100',
  street: 'Rua X',
  number: '10',
  neighborhood: 'Centro',
  city: 'SP',
  state: 'SP',
};

describe('AddressesController.create validation', () => {
  it('passes the CallerContext (userId + role) to the service', async () => {
    const { controller, addressService } = buildController();
    await controller.create(req('CUSTOMER'), { ownerType: 'CUSTOMER', ...validBody } as any);
    expect(addressService.create).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'CUSTOMER' },
      expect.objectContaining({ ownerType: 'CUSTOMER' }),
    );
  });

  it('rejects an invalid ownerType', async () => {
    const { controller } = buildController();
    await expect(
      controller.create(req(), { ownerType: 'ADMIN', ...validBody } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a missing required field (cep)', async () => {
    const { controller } = buildController();
    const { cep, ...noCep } = validBody;
    await expect(
      controller.create(req(), { ownerType: 'CUSTOMER', ...noCep } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires ownerId for SELLER addresses', async () => {
    const { controller } = buildController();
    await expect(
      controller.create(req('SELLER'), { ownerType: 'SELLER', ...validBody } as any),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('AddressesController.list validation', () => {
  it('requires ownerId when listing SELLER addresses', async () => {
    const { controller } = buildController();
    await expect(controller.list(req('SELLER'), 'SELLER', undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lists customer addresses with no query params', async () => {
    const { controller, addressService } = buildController();
    await controller.list(req(), undefined, undefined);
    expect(addressService.list).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'CUSTOMER' },
      { ownerType: undefined, ownerId: undefined },
    );
  });
});
