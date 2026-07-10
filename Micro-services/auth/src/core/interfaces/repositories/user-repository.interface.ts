import { User, UserRole } from '../../entities/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface CreateUserInput {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
}

export interface CreateOutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface IUserRepository {
  findByGoogleId(googleId: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  updateProfile(id: string, data: { name: string; avatarUrl: string | null }): Promise<User>;
  /**
   * Persiste o usuário e o OutboxEvent na MESMA transação (Transactional Outbox).
   * Violação de unique (P2002, e-mail duplicado) vira EmailAlreadyInUseException.
   */
  createWithEvent(user: CreateUserInput, event: CreateOutboxEventInput): Promise<User>;
}
