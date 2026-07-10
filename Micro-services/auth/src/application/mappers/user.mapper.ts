import { User } from '../../core/entities/user.entity';
import { UserResponseDto } from '../../adapters/in/dtos/user-response.dto';

export class UserMapper {
  static toResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }
}
