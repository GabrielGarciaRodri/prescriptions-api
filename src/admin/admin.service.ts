import { Injectable } from '@nestjs/common';
import { Prisma, PrescriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface MetricsQuery {
  from?: string;
  to?: string;
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getMetrics(query: MetricsQuery) {
    const dateFilter: Prisma.PrescriptionWhereInput = {};
    if (query.from || query.to) {
      dateFilter.createdAt = {};
      if (query.from) dateFilter.createdAt.gte = new Date(query.from);
      if (query.to) dateFilter.createdAt.lte = new Date(query.to);
    }

    const [doctors, patients, totalPrescriptions, pending, consumed, byDayRaw, topDoctorsRaw] =
      await Promise.all([
        this.prisma.doctor.count(),
        this.prisma.patient.count(),
        this.prisma.prescription.count({ where: dateFilter }),
        this.prisma.prescription.count({
          where: { ...dateFilter, status: PrescriptionStatus.pending },
        }),
        this.prisma.prescription.count({
          where: { ...dateFilter, status: PrescriptionStatus.consumed },
        }),
        this.byDay(query),
        this.topDoctors(query),
      ]);

    return {
      totals: {
        doctors,
        patients,
        prescriptions: totalPrescriptions,
      },
      byStatus: {
        pending,
        consumed,
      },
      byDay: byDayRaw,
      topDoctors: topDoctorsRaw,
    };
  }

  /**
   * Agregación por día. Prisma no expone groupBy con date_trunc directo,
   * así que usamos $queryRaw. Devuelve los últimos 30 días por defecto.
   */
  private async byDay(query: MetricsQuery): Promise<{ date: string; count: number }[]> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<
      { date: Date; count: bigint }[]
    >`
      SELECT
        DATE("createdAt") AS date,
        COUNT(*)::bigint AS count
      FROM "Prescription"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      count: Number(r.count),
    }));
  }

  private async topDoctors(query: MetricsQuery) {
    const dateFilter: Prisma.PrescriptionWhereInput = {};
    if (query.from || query.to) {
      dateFilter.createdAt = {};
      if (query.from) dateFilter.createdAt.gte = new Date(query.from);
      if (query.to) dateFilter.createdAt.lte = new Date(query.to);
    }

    const grouped = await this.prisma.prescription.groupBy({
      by: ['authorId'],
      where: dateFilter,
      _count: { authorId: true },
      orderBy: { _count: { authorId: 'desc' } },
      take: 5,
    });

    if (grouped.length === 0) return [];

    const doctors = await this.prisma.doctor.findMany({
      where: { id: { in: grouped.map((g) => g.authorId) } },
      include: { user: { select: { name: true } } },
    });

    return grouped.map((g) => {
      const doctor = doctors.find((d) => d.id === g.authorId);
      return {
        doctorId: g.authorId,
        name: doctor?.user.name ?? 'Desconocido',
        specialty: doctor?.specialty ?? null,
        count: g._count.authorId,
      };
    });
  }
}