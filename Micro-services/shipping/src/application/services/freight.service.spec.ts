import { FreightService } from './freight.service';
import { CepNotFoundException } from '../../core/exceptions/cep-not-found.exception';
import { InvalidCepException } from '../../core/exceptions/invalid-cep.exception';

function buildService() {
  const cepGateway = { lookup: jest.fn() } as any;
  const freightGateway = { quote: jest.fn().mockResolvedValue([]) } as any;
  const service = new FreightService(cepGateway, freightGateway);
  return { service, cepGateway, freightGateway };
}

describe('FreightService.lookupCep', () => {
  it('returns the resolved address for a valid CEP', async () => {
    const { service, cepGateway } = buildService();
    cepGateway.lookup.mockResolvedValue({
      cep: '01310-100',
      street: 'Av Paulista',
      neighborhood: 'Bela Vista',
      city: 'SP',
      state: 'SP',
    });
    await expect(service.lookupCep('01310100')).resolves.toMatchObject({ state: 'SP' });
  });

  it('throws InvalidCep for a malformed CEP (not 8 digits) without hitting the gateway', async () => {
    const { service, cepGateway } = buildService();
    await expect(service.lookupCep('123')).rejects.toThrow(InvalidCepException);
    expect(cepGateway.lookup).not.toHaveBeenCalled();
  });

  it('throws CepNotFound when the gateway returns null', async () => {
    const { service, cepGateway } = buildService();
    cepGateway.lookup.mockResolvedValue(null);
    await expect(service.lookupCep('00000000')).rejects.toThrow(CepNotFoundException);
  });
});

describe('FreightService.previewQuote', () => {
  it('validates both CEPs and delegates to the freight gateway (weight only, no dimensions)', async () => {
    const { service, freightGateway } = buildService();
    freightGateway.quote.mockResolvedValue([{ carrier: 'PAC', price: '15.00', estimatedDays: 8 }]);

    const options = await service.previewQuote({
      originCep: '01310100',
      destinationCep: '20000000',
      weightGrams: 800,
    });

    expect(freightGateway.quote).toHaveBeenCalledWith({
      originCep: '01310100',
      destinationCep: '20000000',
      weightGrams: 800,
    });
    expect(options[0].price).toBe('15.00');
  });

  it('rejects when a CEP is malformed', async () => {
    const { service } = buildService();
    await expect(
      service.previewQuote({ originCep: 'x', destinationCep: '20000000', weightGrams: 800 }),
    ).rejects.toThrow(InvalidCepException);
  });
});
