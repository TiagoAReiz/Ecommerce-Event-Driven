import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { STOCK_RESERVATION_REPOSITORY } from '../../core/interfaces/repositories/stock-reservation-repository.interface';
import type { IStockReservationRepository } from '../../core/interfaces/repositories/stock-reservation-repository.interface';

const SWEEP_INTERVAL_MS = 60_000;

// Job periódico: libera reservas com TTL vencido (status PENDING, expiresAt < agora), devolvendo
// o `reservedQty`, e publica `StockReleased` reason EXPIRED por SubOrder (via outbox, na mesma tx).
@Injectable()
export class ReservationExpiryService {
  private readonly logger = new Logger(ReservationExpiryService.name);
  private isSweeping = false;

  constructor(
    @Inject(STOCK_RESERVATION_REPOSITORY)
    private readonly reservationRepository: IStockReservationRepository,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweepExpiredReservations(): Promise<void> {
    if (this.isSweeping) {
      return;
    }

    this.isSweeping = true;
    try {
      const expired = await this.reservationRepository.expireDueReservations(new Date());
      if (expired > 0) {
        this.logger.log(`Released ${expired} expired reservation(s)`);
      }
    } catch (error) {
      this.logger.error('Failed to sweep expired reservations', error as Error);
    } finally {
      this.isSweeping = false;
    }
  }
}
