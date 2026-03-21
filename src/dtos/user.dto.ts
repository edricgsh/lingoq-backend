import { UserRole } from 'src/enums/user-role.enum';

export class UserDTO {
  userId: string;
  username: string;
  role: UserRole;
}
