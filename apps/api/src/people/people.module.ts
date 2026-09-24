import { Module } from '@nestjs/common';
import { GuardiansController } from './guardians.controller';
import { StaffController } from './staff.controller';
import { StudentsController } from './students.controller';

@Module({
  controllers: [StudentsController, GuardiansController, StaffController],
})
export class PeopleModule {}
