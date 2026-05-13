import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma, PrescriptionStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { ListPrescriptionsDto } from './dto/list-prescriptions.dto';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { PrescriptionPdfService } from './pdf/prescription-pdf.service';

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private pdf: PrescriptionPdfService,
  ) {}

  private generateCode(): string {
    return `RX-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  /**
   * Crea una prescripción. Solo el doctor autenticado puede crearla
   * y queda automáticamente como su autor.
   */
  async create(dto: CreatePrescriptionDto, user: AuthUser) {
    if (!user.doctorId) {
      throw new ForbiddenException('Solo médicos pueden crear prescripciones');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    // Reintento simple por si el código aleatorio colisiona (probabilidad ínfima
    // con 32 bits, pero el reintento es trivial y robusto)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.prescription.create({
          data: {
            code: this.generateCode(),
            notes: dto.notes,
            authorId: user.doctorId,
            patientId: dto.patientId,
            items: { create: dto.items },
          },
          include: {
            items: true,
            patient: { include: { user: { select: { name: true, email: true } } } },
            author: { include: { user: { select: { name: true, email: true } } } },
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < 2
        ) {
          continue; // colisión de code, reintentar
        }
        throw e;
      }
    }
    throw new ConflictException('No se pudo generar un código único');
  }

  /**
   * Listado con filtros según rol:
   * - Doctor con mine=true (o por defecto): solo las suyas
   * - Patient: solo las suyas (forzado, ignora filtros de autor)
   * - Admin: todas, con filtros opcionales por doctorId/patientId
   */
  async list(query: ListPrescriptionsDto, user: AuthUser) {
    const where: Prisma.PrescriptionWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    if (user.role === Role.doctor) {
      where.authorId = user.doctorId;
    } else if (user.role === Role.patient) {
      where.patientId = user.patientId;
    } else if (user.role === Role.admin) {
      if (query.doctorId) where.authorId = query.doctorId;
      if (query.patientId) where.patientId = query.patientId;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.prescription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: query.order ?? 'desc' },
        include: {
          items: true,
          patient: { include: { user: { select: { name: true, email: true } } } },
          author: { include: { user: { select: { name: true, email: true } } } },
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detalle con validación de acceso según rol.
   */
  async findOne(id: string, user: AuthUser) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        items: true,
        patient: { include: { user: { select: { name: true, email: true } } } },
        author: { include: { user: { select: { name: true, email: true } } } },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescripción no encontrada');
    }

    this.assertCanAccess(prescription, user);
    return prescription;
  }

  /**
   * Marca como consumida. Solo el paciente dueño.
   */
  async consume(id: string, user: AuthUser) {
    if (user.role !== Role.patient || !user.patientId) {
      throw new ForbiddenException('Solo el paciente puede consumir prescripciones');
    }

    const prescription = await this.prisma.prescription.findUnique({ where: { id } });
    if (!prescription) {
      throw new NotFoundException('Prescripción no encontrada');
    }
    if (prescription.patientId !== user.patientId) {
      throw new ForbiddenException('No es tu prescripción');
    }
    if (prescription.status === PrescriptionStatus.consumed) {
      throw new ConflictException('La prescripción ya fue consumida');
    }

    return this.prisma.prescription.update({
      where: { id },
      data: {
        status: PrescriptionStatus.consumed,
        consumedAt: new Date(),
      },
      include: {
        items: true,
        patient: { include: { user: { select: { name: true, email: true } } } },
        author: { include: { user: { select: { name: true, email: true } } } },
      },
    });
  }

  /**
   * Genera el PDF. Solo paciente dueño, doctor autor o admin.
   */
  async generatePdf(id: string, user: AuthUser): Promise<{ buffer: Buffer; filename: string }> {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        items: true,
        patient: { include: { user: true } },
        author: { include: { user: true } },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescripción no encontrada');
    }
    this.assertCanAccess(prescription, user);

    const buffer = await this.pdf.generate(prescription);
    return { buffer, filename: `${prescription.code}.pdf` };
  }

  /**
   * Reglas de acceso por rol (centralizadas para reutilizar).
   * - Admin: todo
   * - Doctor: solo si es el autor
   * - Patient: solo si es el dueño
   */
  private assertCanAccess(
    prescription: { authorId: string; patientId: string },
    user: AuthUser,
  ) {
    if (user.role === Role.admin) return;
    if (user.role === Role.doctor && prescription.authorId === user.doctorId) return;
    if (user.role === Role.patient && prescription.patientId === user.patientId) return;
    throw new ForbiddenException('No tienes acceso a esta prescripción');
  }
}