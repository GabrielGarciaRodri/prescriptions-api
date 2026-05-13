import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { PatientsService } from './patients.service';

@Controller('patients')
@Roles(Role.doctor, Role.admin)
export class PatientsController {
  constructor(private patients: PatientsService) {}

  @Get('search')
  async search(@Query('email') email: string) {
    return this.patients.searchByEmail(email ?? '');
  }
}