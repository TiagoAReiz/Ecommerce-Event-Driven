import { BadRequestException } from '@nestjs/common';
import { FreightController } from './freight.controller';

function buildController() {
  const freightService = {
    previewQuote: jest.fn().mockResolvedValue([{ carrier: 'PAC', price: '15.00', estimatedDays: 8 }]),
  } as any;
  const controller = new FreightController(freightService);
  return { controller, freightService };
}

describe('FreightController.quote', () => {
  it('returns the preview options for valid params', async () => {
    const { controller, freightService } = buildController();
    const res = await controller.quote('01310100', '20000000', '800');
    expect(freightService.previewQuote).toHaveBeenCalledWith({
      originCep: '01310100',
      destinationCep: '20000000',
      weightGrams: 800,
    });
    expect(res).toMatchObject({ weightGrams: 800, options: [{ carrier: 'PAC', price: '15.00' }] });
  });

  it('rejects when a CEP query param is missing', async () => {
    const { controller } = buildController();
    await expect(controller.quote('', '20000000', '800')).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-positive weightGrams', async () => {
    const { controller } = buildController();
    await expect(controller.quote('01310100', '20000000', '0')).rejects.toThrow(BadRequestException);
    await expect(controller.quote('01310100', '20000000', 'abc')).rejects.toThrow(BadRequestException);
  });
});
