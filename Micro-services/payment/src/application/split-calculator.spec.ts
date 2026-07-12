import { PLATFORM_FEE_RATE, computeSplit } from './split-calculator';

describe('computeSplit', () => {
  it('applies the platform fee to the subtotal only and passes shipping through to the seller', () => {
    // subtotal 100.00 @ 10% => fee 10.00; amount = 100 + 20 (frete) - 10 = 110.00
    const split = computeSplit('100.00', '20.00');
    expect(split.platformFeeAmount).toBe('10.00');
    expect(split.amount).toBe('110.00');
  });

  it('keeps the invariant amount + fee === subtotal + shipping (fixed-2)', () => {
    const cases: Array<[string, string]> = [
      ['99.90', '12.34'],
      ['0.01', '0.00'],
      ['33.33', '7.77'],
      ['1000.00', '0.00'],
      ['49.95', '19.99'],
    ];
    for (const [subtotal, shipping] of cases) {
      const { amount, platformFeeAmount } = computeSplit(subtotal, shipping);
      const lhs = Math.round((Number(amount) + Number(platformFeeAmount)) * 100);
      const rhs = Math.round((Number(subtotal) + Number(shipping)) * 100);
      expect(lhs).toBe(rhs);
    }
  });

  it('always returns fixed-2 strings (no dropped trailing zeros)', () => {
    const split = computeSplit('50.00', '0.00');
    expect(split.amount).toMatch(/^\d+\.\d{2}$/);
    expect(split.platformFeeAmount).toMatch(/^\d+\.\d{2}$/);
  });

  it('rounds the fee half-up in integer cents (no float drift)', () => {
    // 33.33 * 0.10 = 3.333 -> 333.3 cents -> rounds to 333 => 3.33
    const split = computeSplit('33.33', '0.00');
    expect(split.platformFeeAmount).toBe('3.33');
    expect(split.amount).toBe('30.00');
  });

  it('exposes the platform fee rate as a single constant', () => {
    expect(PLATFORM_FEE_RATE).toBe(0.1);
  });
});
