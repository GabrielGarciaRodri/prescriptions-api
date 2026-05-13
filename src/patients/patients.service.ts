import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async searchByEmail(query: string) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const patients = await this.prisma.patient.findMany({
      where: {
        user: {
          email: {
            contains: query.trim(),
            mode: 'insensitive',
          },
        },
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
      take: 10,
      orderBy: { user: { email: 'asc' } },
    });

    return patients.map((p) => ({
      id: p.id,
      email: p.user.email,
      name: p.user.name,
      birthDate: p.birthDate,
    }));
  }
}