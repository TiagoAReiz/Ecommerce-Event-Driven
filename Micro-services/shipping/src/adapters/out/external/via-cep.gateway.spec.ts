import { ViaCepGateway } from './via-cep.gateway';
import { CepServiceUnavailableException } from '../../../core/exceptions/cep-service-unavailable.exception';

describe('ViaCepGateway', () => {
  const OLD_ENV = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...OLD_ENV, VIA_CEP_URL: 'http://viacep.local/ws' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('resolves the address for a valid CEP (accepts hyphen)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cep: '01310-100',
        logradouro: 'Avenida Paulista',
        bairro: 'Bela Vista',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    });
    global.fetch = fetchMock as any;
    const gateway = new ViaCepGateway();

    const address = await gateway.lookup('01310-100');

    expect(fetchMock).toHaveBeenCalledWith('http://viacep.local/ws/01310100/json/');
    expect(address).toEqual({
      cep: '01310-100',
      street: 'Avenida Paulista',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    });
  });

  it('returns null for a malformed CEP (not 8 digits), without calling the network', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const gateway = new ViaCepGateway();

    await expect(gateway.lookup('123')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when ViaCEP responds with the "erro" flag (CEP does not exist)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ erro: true }),
    }) as any;
    const gateway = new ViaCepGateway();

    await expect(gateway.lookup('00000000')).resolves.toBeNull();
  });

  it('throws CepServiceUnavailableException on a non-ok HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    const gateway = new ViaCepGateway();

    await expect(gateway.lookup('01310100')).rejects.toThrow(CepServiceUnavailableException);
  });

  it('throws CepServiceUnavailableException when the network call fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
    const gateway = new ViaCepGateway();

    await expect(gateway.lookup('01310100')).rejects.toThrow(CepServiceUnavailableException);
  });
});
