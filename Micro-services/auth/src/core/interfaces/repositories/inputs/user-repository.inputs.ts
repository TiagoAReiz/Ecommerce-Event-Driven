import { UserRole } from '../../../entities/user.entity';

// Forma de escrita pra criar um User (id gerado no service — é o mesmo id usado no evento
// UserRegistered do outbox).
export interface CreateUserInput {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
}
