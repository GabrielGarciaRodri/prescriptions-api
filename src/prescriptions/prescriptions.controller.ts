import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import express from 'express';
import { Role } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { ListPrescriptionsDto } from './dto/list-prescriptions.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import * as currentUserDecorator from '../auth/decorators/current-user.decorator';

@Controller()
export class PrescriptionsController {
  constructor(private prescriptions: PrescriptionsService) {}

  // === Doctor ===
  @Post('prescriptions')
  @Roles(Role.doctor)
  async create(@Body() dto: CreatePrescriptionDto, @currentUserDecorator.CurrentUser() user: currentUserDecorator.AuthUser) {
    return this.prescriptions.create(dto, user);
  }

  // === Listado: doctor (las suyas), admin (todas con filtros) ===
  @Get('prescriptions')
  @Roles(Role.doctor, Role.admin)
  async list(@Query() query: ListPrescriptionsDto, @currentUserDecorator.CurrentUser() user: currentUserDecorator.AuthUser) {
    return this.prescriptions.list(query, user);
  }

  // === Listado del paciente (alias semántico) ===
  @Get('me/prescriptions')
  @Roles(Role.patient)
  async myList(@Query() query: ListPrescriptionsDto, @currentUserDecorator.CurrentUser() user: currentUserDecorator.AuthUser) {
    return this.prescriptions.list(query, user);
  }

  // === Detalle (cualquier rol, validación interna) ===
  @Get('prescriptions/:id')
  @Roles(Role.doctor, Role.patient, Role.admin)
  async findOne(@Param('id') id: string, @currentUserDecorator.CurrentUser() user: currentUserDecorator.AuthUser) {
    return this.prescriptions.findOne(id, user);
  }

  // === Consumir (solo paciente dueño) ===
  @Put('prescriptions/:id/consume')
  @Roles(Role.patient)
  @HttpCode(HttpStatus.OK)
  async consume(@Param('id') id: string, @currentUserDecorator.CurrentUser() user: currentUserDecorator.AuthUser) {
    return this.prescriptions.consume(id, user);
  }

  // === PDF (paciente dueño, doctor autor o admin) ===
  @Get('prescriptions/:id/pdf')
  @Roles(Role.doctor, Role.patient, Role.admin)
  async pdf(
    @Param('id') id: string,
    @currentUserDecorator.CurrentUser() user: currentUserDecorator.AuthUser,
    @Res() res: express.Response,
  ) {
    const { buffer, filename } = await this.prescriptions.generatePdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}