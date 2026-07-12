import { ReservationExpiryService } from './reservation-expiry.service';

describe('ReservationExpiryService', () => {
  it('sweeps expired reservations with the current time', async () => {
    const reservationRepository = { expireDueReservations: jest.fn().mockResolvedValue(3) } as any;
    const service = new ReservationExpiryService(reservationRepository);

    await service.sweepExpiredReservations();

    expect(reservationRepository.expireDueReservations).toHaveBeenCalledTimes(1);
    expect(reservationRepository.expireDueReservations.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it('swallows repository errors so the interval keeps running', async () => {
    const reservationRepository = {
      expireDueReservations: jest.fn().mockRejectedValue(new Error('db down')),
    } as any;
    const service = new ReservationExpiryService(reservationRepository);

    await expect(service.sweepExpiredReservations()).resolves.toBeUndefined();
  });
});
