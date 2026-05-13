import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionPdfService } from './pdf/prescription-pdf.service';
import { PrescriptionStatus, Role } from '@prisma/client';
import { AuthUser } from '../auth/decorators/current-user.decorator';

describe('PrescriptionsService - consume()', () => {
  let service: PrescriptionsService;
  let prisma: {
    prescription: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      prescription: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PrescriptionPdfService, useValue: { generate: jest.fn() } },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  const patientUser: AuthUser = {
    userId: 'u1',
    email: 'p@test.com',
    role: Role.patient,
    patientId: 'patient-1',
  };

  const doctorUser: AuthUser = {
    userId: 'u2',
    email: 'd@test.com',
    role: Role.doctor,
    doctorId: 'doctor-1',
  };

  it('rechaza si el usuario no es paciente', async () => {
    await expect(service.consume('rx-1', doctorUser)).rejects.toThrow(ForbiddenException);
    expect(prisma.prescription.findUnique).not.toHaveBeenCalled();
  });

  it('lanza NotFound si la prescripción no existe', async () => {
    prisma.prescription.findUnique.mockResolvedValue(null);
    await expect(service.consume('rx-x', patientUser)).rejects.toThrow(NotFoundException);
  });

  it('rechaza si la prescripción no pertenece al paciente', async () => {
    prisma.prescription.findUnique.mockResolvedValue({
      id: 'rx-1',
      patientId: 'otro-paciente',
      status: PrescriptionStatus.pending,
    });
    await expect(service.consume('rx-1', patientUser)).rejects.toThrow(ForbiddenException);
  });

  it('rechaza con 409 si ya está consumida', async () => {
    prisma.prescription.findUnique.mockResolvedValue({
      id: 'rx-1',
      patientId: 'patient-1',
      status: PrescriptionStatus.consumed,
    });
    await expect(service.consume('rx-1', patientUser)).rejects.toThrow(ConflictException);
  });

  it('consume correctamente cuando todo es válido', async () => {
    prisma.prescription.findUnique.mockResolvedValue({
      id: 'rx-1',
      patientId: 'patient-1',
      status: PrescriptionStatus.pending,
    });
    prisma.prescription.update.mockResolvedValue({
      id: 'rx-1',
      status: PrescriptionStatus.consumed,
      consumedAt: new Date(),
    });

    const result = await service.consume('rx-1', patientUser);

    expect(prisma.prescription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rx-1' },
        data: expect.objectContaining({
          status: PrescriptionStatus.consumed,
          consumedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.status).toBe(PrescriptionStatus.consumed);
  });
});