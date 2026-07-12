import { User, UserRole } from '../../entities/user.entity';
import { CreateUserInput } from './inputs/user-repository.inputs';
import { CreateOutboxEventInput } from './inputs/outbox-event.input';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

// Resultado de consumir um SellerOnboarded (ver promoteToSellerWithInbox). Usado pelo service só
// para logar; nenhuma variante é um erro (todas são estados válidos e idempotentes).
export type PromoteToSellerResult =
  | { outcome: 'PROMOTED'; oldRole: UserRole }
  | { outcome: 'ALREADY_SELLER' }
  | { outcome: 'USER_NOT_FOUND' }
  | { outcome: 'DEDUPED' };

export interface IUserRepository {
  findByGoogleId(googleId: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  updateProfile(id: string, data: { name: string; avatarUrl: string | null }): Promise<User>;
  /**
   * Persiste o usuário e o OutboxEvent na MESMA transação (Transactional Outbox).
   * Violação de unique (P2002, e-mail duplicado) vira EmailAlreadyInUseException.
   */
  createWithEvent(user: CreateUserInput, event: CreateOutboxEventInput): Promise<User>;
  /**
   * Consome SellerOnboarded de forma idempotente e atômica: numa única transação faz o dedupe de
   * inbox (ProcessedEvent por eventId), promove o usuário a SELLER se ainda não for, e grava o
   * OutboxEvent `UserRoleChanged` — tudo ou nada. Só emite o evento quando a role realmente muda.
   */
  promoteToSellerWithInbox(
    eventId: string,
    eventType: string,
    userId: string,
  ): Promise<PromoteToSellerResult>;
}
