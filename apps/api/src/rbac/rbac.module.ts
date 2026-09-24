import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { UsersController } from './users.controller';

@Module({
  controllers: [RolesController, UsersController],
})
export class RbacModule {}
