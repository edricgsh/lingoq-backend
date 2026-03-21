import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDTO } from 'src/dtos/user.dto';

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserDTO => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
