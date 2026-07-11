import { StubCepGateway } from './stub-cep.gateway';

describe('StubCepGateway (deterministic stub)', () => {
  const gateway = new StubCepGateway();

  it('resolves a stable fake address for a valid 8-digit CEP (accepts hyphen)', async () => {
    const a = await gateway.lookup('01310100');
    const b = await gateway.lookup('01310-100');
    expect(a).not.toBeNull();
    expect(a).toEqual(b); // determinístico e ignora hífen
    expect(a).toMatchObject({ cep: '01310-100', state: 'SP' });
  });

  it('returns null for a malformed CEP (not 8 digits)', async () => {
    expect(await gateway.lookup('123')).toBeNull();
  });

  it('returns null for the sentinel "not found" CEP 00000000', async () => {
    expect(await gateway.lookup('00000000')).toBeNull();
  });

  it('maps the first digit to a UF deterministically', async () => {
    expect((await gateway.lookup('20000000'))?.state).toBe('RJ');
    expect((await gateway.lookup('90000000'))?.state).toBe('RS');
  });
});
