import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@Roles(Role.admin)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('metrics')
  async metrics(@Query('from') from?: string, @Query('to') to?: string) {
    return this.admin.getMetrics({ from, to });
  }
}