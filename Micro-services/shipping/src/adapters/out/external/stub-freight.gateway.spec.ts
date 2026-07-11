import { StubFreightGateway } from './stub-freight.gateway';

describe('StubFreightGateway (deterministic stub)', () => {
  const gateway = new StubFreightGateway();

  it('returns PAC and SEDEX options ordered by price ascending, with fixed-2 string prices', async () => {
    const options = await gateway.quote({
      originCep: '01310100',
      destinationCep: '20000000',
      weightGrams: 1000,
    });
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.carrier)).toEqual(['PAC', 'SEDEX']);
    for (const o of options) {
      expect(o.price).toMatch(/^\d+\.\d{2}$/); // fixed-2, nunca float cru
    }
    expect(Number(options[0].price)).toBeLessThanOrEqual(Number(options[1].price));
  });

  it('is deterministic: same input yields the same price/estimatedDays', async () => {
    const input = { originCep: '01310100', destinationCep: '20000000', weightGrams: 1500 };
    const a = await gateway.quote(input);
    const b = await gateway.quote(input);
    expect(a).toEqual(b);
  });

  it('charges more for heavier packages', async () => {
    const light = await gateway.quote({ originCep: '01000000', destinationCep: '01000000', weightGrams: 100 });
    const heavy = await gateway.quote({ originCep: '01000000', destinationCep: '01000000', weightGrams: 20000 });
    expect(Number(heavy[0].price)).toBeGreaterThan(Number(light[0].price));
  });

  it('adds a volumetric surcharge when dimensions are provided', async () => {
    const base = { originCep: '01000000', destinationCep: '01000000', weightGrams: 500 };
    const noDims = await gateway.quote(base);
    const withDims = await gateway.quote({ ...base, heightCm: 50, widthCm: 50, lengthCm: 50 });
    expect(Number(withDims[0].price)).toBeGreaterThan(Number(noDims[0].price));
  });
});
