import "dotenv/config";
import { PrismaClient, Role, PrescriptionStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function generateCode(): string {
  return `RX-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  console.log("Limpiando datos existentes...");
  await prisma.prescriptionItem.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();

  console.log("Creando usuarios...");

  const adminPwd = await bcrypt.hash("admin123", 10);
  const drPwd = await bcrypt.hash("dr123", 10);
  const patientPwd = await bcrypt.hash("patient123", 10);

  await prisma.user.create({
    data: {
      email: "admin@test.com",
      password: adminPwd,
      name: "Admin Principal",
      role: Role.admin,
    },
  });

  const dr1 = await prisma.user.create({
    data: {
      email: "dr@test.com",
      password: drPwd,
      name: "Dr. Carlos Ramírez",
      role: Role.doctor,
      doctorProfile: {
        create: {
          specialty: "Medicina General",
          license: "TP-12345",
        },
      },
    },
    include: { doctorProfile: true },
  });

  const dr2 = await prisma.user.create({
    data: {
      email: "dr2@test.com",
      password: drPwd,
      name: "Dra. Laura Pérez",
      role: Role.doctor,
      doctorProfile: {
        create: {
          specialty: "Pediatría",
          license: "TP-67890",
        },
      },
    },
    include: { doctorProfile: true },
  });

  const pat1 = await prisma.user.create({
    data: {
      email: "patient@test.com",
      password: patientPwd,
      name: "Ana López",
      role: Role.patient,
      patientProfile: {
        create: {
          birthDate: new Date("1990-05-15"),
          phone: "3001234567",
        },
      },
    },
    include: { patientProfile: true },
  });

  const pat2 = await prisma.user.create({
    data: {
      email: "patient2@test.com",
      password: patientPwd,
      name: "Pedro Gómez",
      role: Role.patient,
      patientProfile: {
        create: {
          birthDate: new Date("1985-11-23"),
          phone: "3107654321",
        },
      },
    },
    include: { patientProfile: true },
  });

  console.log("Creando prescripciones...");

  const prescriptionsData = [
    {
      doctor: dr1.doctorProfile!.id,
      patient: pat1.patientProfile!.id,
      status: PrescriptionStatus.consumed,
      daysAgo: 25,
      notes: "Control post-consulta. Tomar con abundante agua.",
      items: [
        { name: "Amoxicilina 500mg", dosage: "1 cada 8h", quantity: 21, instructions: "Después de comer" },
        { name: "Ibuprofeno 400mg", dosage: "1 cada 12h", quantity: 10, instructions: "En caso de dolor" },
      ],
    },
    {
      doctor: dr1.doctorProfile!.id,
      patient: pat1.patientProfile!.id,
      status: PrescriptionStatus.consumed,
      daysAgo: 20,
      notes: null,
      items: [
        { name: "Loratadina 10mg", dosage: "1 al día", quantity: 30, instructions: "En la mañana" },
      ],
    },
    {
      doctor: dr1.doctorProfile!.id,
      patient: pat2.patientProfile!.id,
      status: PrescriptionStatus.pending,
      daysAgo: 15,
      notes: "Tratamiento por 7 días.",
      items: [
        { name: "Omeprazol 20mg", dosage: "1 en ayunas", quantity: 14, instructions: "Antes del desayuno" },
      ],
    },
    {
      doctor: dr2.doctorProfile!.id,
      patient: pat2.patientProfile!.id,
      status: PrescriptionStatus.consumed,
      daysAgo: 12,
      notes: "Tratamiento pediátrico estándar.",
      items: [
        { name: "Acetaminofén pediátrico", dosage: "5ml cada 6h", quantity: 1, instructions: "En caso de fiebre" },
        { name: "Suero oral", dosage: "A libre demanda", quantity: 4, instructions: "En caso de diarrea" },
      ],
    },
    {
      doctor: dr2.doctorProfile!.id,
      patient: pat1.patientProfile!.id,
      status: PrescriptionStatus.pending,
      daysAgo: 8,
      notes: null,
      items: [
        { name: "Vitamina D 1000UI", dosage: "1 al día", quantity: 60, instructions: "Con el almuerzo" },
      ],
    },
    {
      doctor: dr1.doctorProfile!.id,
      patient: pat1.patientProfile!.id,
      status: PrescriptionStatus.consumed,
      daysAgo: 6,
      notes: "Seguimiento mensual.",
      items: [
        { name: "Metformina 850mg", dosage: "1 cada 12h", quantity: 60, instructions: "Con las comidas" },
      ],
    },
    {
      doctor: dr1.doctorProfile!.id,
      patient: pat2.patientProfile!.id,
      status: PrescriptionStatus.pending,
      daysAgo: 4,
      notes: "Control de presión arterial.",
      items: [
        { name: "Losartán 50mg", dosage: "1 al día", quantity: 30, instructions: "En la mañana" },
        { name: "Hidroclorotiazida 25mg", dosage: "1 al día", quantity: 30, instructions: "En la mañana" },
      ],
    },
    {
      doctor: dr2.doctorProfile!.id,
      patient: pat1.patientProfile!.id,
      status: PrescriptionStatus.consumed,
      daysAgo: 3,
      notes: null,
      items: [
        { name: "Salbutamol inhalador", dosage: "2 puffs cada 6h", quantity: 1, instructions: "En crisis respiratoria" },
      ],
    },
    {
      doctor: dr1.doctorProfile!.id,
      patient: pat2.patientProfile!.id,
      status: PrescriptionStatus.pending,
      daysAgo: 2,
      notes: "Antibiótico de amplio espectro.",
      items: [
        { name: "Azitromicina 500mg", dosage: "1 al día", quantity: 5, instructions: "Por 5 días" },
      ],
    },
    {
      doctor: dr2.doctorProfile!.id,
      patient: pat1.patientProfile!.id,
      status: PrescriptionStatus.pending,
      daysAgo: 1,
      notes: "Suplementación.",
      items: [
        { name: "Hierro + Ácido Fólico", dosage: "1 al día", quantity: 30, instructions: "Con jugo de naranja" },
      ],
    },
  ];

  for (const p of prescriptionsData) {
    const createdAt = daysAgo(p.daysAgo);
    await prisma.prescription.create({
      data: {
        code: generateCode(),
        status: p.status,
        notes: p.notes,
        createdAt,
        consumedAt: p.status === PrescriptionStatus.consumed ? createdAt : null,
        authorId: p.doctor,
        patientId: p.patient,
        items: {
          create: p.items,
        },
      },
    });
  }

  console.log("Seed completado.");
  console.log("---");
  console.log("Cuentas de prueba:");
  console.log("  admin@test.com / admin123");
  console.log("  dr@test.com / dr123");
  console.log("  dr2@test.com / dr123");
  console.log("  patient@test.com / patient123");
  console.log("  patient2@test.com / patient123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });