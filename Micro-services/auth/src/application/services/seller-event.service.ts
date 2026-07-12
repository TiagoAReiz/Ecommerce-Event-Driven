import { Inject, Injectable, Logger } from '@nestjs/common';
import { USER_REPOSITORY } from '../../core/interfaces/repositories/user-repository.interface';
import type { IUserRepository } from '../../core/interfaces/repositories/user-repository.interface';
import {
  ISellerEventService,
  SellerOnboardedPayload,
} from '../../core/interfaces/services/seller-event.service.interface';

// Reage a `SellerOnboarded` (catalog-events): promove o usuário que virou seller para a role SELLER
// e emite `UserRoleChanged`. A atomicidade (dedupe + update + outbox) fica no repositório; aqui só
// orquestramos e logamos o resultado.
@Injectable()
export class SellerEventService implements ISellerEventService {
  private readonly logger = new Logger(SellerEventService.name);

  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  async handleSellerOnboarded(eventId: string, payload: SellerOnboardedPayload): Promise<void> {
    const result = await this.userRepository.promoteToSellerWithInbox(
      eventId,
      'SellerOnboarded',
      payload.userId,
    );

    switch (result.outcome) {
      case 'PROMOTED':
        this.logger.log(
          `User ${payload.userId} promoted ${result.oldRole} -> SELLER (seller ${payload.sellerId})`,
        );
        return;
      case 'ALREADY_SELLER':
        this.logger.debug(`User ${payload.userId} already SELLER — no-op`);
        return;
      case 'DEDUPED':
        this.logger.debug(`SellerOnboarded ${eventId} already processed — no-op`);
        return;
      case 'USER_NOT_FOUND':
        this.logger.warn(
          `SellerOnboarded for unknown user ${payload.userId} (seller ${payload.sellerId}) — marked processed`,
        );
        return;
    }
  }
}
