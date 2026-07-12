import { StubTrackingGateway } from './stub-tracking.gateway';

describe('StubTrackingGateway (deterministic stub)', () => {
  const gateway = new StubTrackingGateway();

  it('generates a Correios-shaped code prefixed by carrier and suffixed BR', () => {
    expect(gateway.generateTrackingCode('PAC')).toMatch(/^PC\d{9}BR$/);
    expect(gateway.generateTrackingCode('SEDEX')).toMatch(/^SX\d{9}BR$/);
  });

  it('generates distinct codes on repeated calls', () => {
    const a = gateway.generateTrackingCode('PAC');
    const b = gateway.generateTrackingCode('PAC');
    expect(a).not.toBe(b);
  });
});
