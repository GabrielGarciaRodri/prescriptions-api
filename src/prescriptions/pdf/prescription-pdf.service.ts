import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Prescription, PrescriptionItem, Doctor, Patient, User } from '@prisma/client';

type PrescriptionWithRelations = Prescription & {
  items: PrescriptionItem[];
  author: Doctor & { user: User };
  patient: Patient & { user: User };
};

@Injectable()
export class PrescriptionPdfService {
  async generate(prescription: PrescriptionWithRelations): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderHeader(doc, prescription);
      this.renderPatientAndDoctor(doc, prescription);
      this.renderNotes(doc, prescription);
      this.renderItems(doc, prescription);
      this.renderFooter(doc, prescription);

      doc.end();
    });
  }

  private renderHeader(doc: PDFKit.PDFDocument, p: PrescriptionWithRelations) {
    doc.fontSize(20).font('Helvetica-Bold').text('PRESCRIPCIÓN MÉDICA', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text(`Código: ${p.code}`, { align: 'center' });

    const statusLabel = p.status === 'consumed' ? 'CONSUMIDA' : 'PENDIENTE';
    const statusColor = p.status === 'consumed' ? '#16a34a' : '#ca8a04';
    doc.fillColor(statusColor).font('Helvetica-Bold')
      .text(`Estado: ${statusLabel}`, { align: 'center' });

    doc.fillColor('black').moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#999');
    doc.moveDown(1);
  }

  private renderPatientAndDoctor(doc: PDFKit.PDFDocument, p: PrescriptionWithRelations) {
    const startY = doc.y;

    // Columna izquierda: paciente
    doc.fontSize(11).font('Helvetica-Bold').text('PACIENTE', 50, startY);
    doc.font('Helvetica').fontSize(10)
      .text(p.patient.user.name, 50, doc.y + 2)
      .text(p.patient.user.email)
      .text(p.patient.phone ?? '');

    const leftBottom = doc.y;

    // Columna derecha: médico
    doc.fontSize(11).font('Helvetica-Bold').text('MÉDICO', 300, startY);
    doc.font('Helvetica').fontSize(10)
      .text(`Dr(a). ${p.author.user.name}`, 300, startY + 14)
      .text(p.author.specialty ?? 'Medicina General', 300)
      .text(p.author.license ? `Reg. Profesional: ${p.author.license}` : '', 300);

    doc.y = Math.max(leftBottom, doc.y) + 10;
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd');
    doc.moveDown(0.8);
  }

  private renderNotes(doc: PDFKit.PDFDocument, p: PrescriptionWithRelations) {
    if (!p.notes) return;
    doc.fontSize(11).font('Helvetica-Bold').text('Notas:');
    doc.fontSize(10).font('Helvetica').text(p.notes, { width: 495 });
    doc.moveDown(0.8);
  }

  private renderItems(doc: PDFKit.PDFDocument, p: PrescriptionWithRelations) {
    doc.fontSize(12).font('Helvetica-Bold').text('Medicamentos prescritos');
    doc.moveDown(0.5);

    p.items.forEach((item, idx) => {
      const startY = doc.y;
      doc.fontSize(10).font('Helvetica-Bold')
        .text(`${idx + 1}. ${item.name}`, 50, startY);

      doc.font('Helvetica').fontSize(9).fillColor('#444');
      if (item.dosage) {
        doc.text(`Dosis: ${item.dosage}`, 65);
      }
      if (item.quantity != null) {
        doc.text(`Cantidad: ${item.quantity} unidades`, 65);
      }
      if (item.instructions) {
        doc.text(`Instrucciones: ${item.instructions}`, 65, doc.y, { width: 480 });
      }
      doc.fillColor('black').moveDown(0.5);
    });
  }

  private renderFooter(doc: PDFKit.PDFDocument, p: PrescriptionWithRelations) {
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#999');
    doc.moveDown(0.5);

    const createdStr = p.createdAt.toLocaleDateString('es-CO', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    doc.fontSize(9).fillColor('#666').font('Helvetica')
      .text(`Emitida el ${createdStr}`, { align: 'left' });

    if (p.consumedAt) {
      const consumedStr = p.consumedAt.toLocaleDateString('es-CO', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      doc.text(`Consumida el ${consumedStr}`, { align: 'left' });
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999').font('Helvetica-Oblique')
      .text(
        'Este documento es una prescripción médica generada electrónicamente. ' +
        'Conserve este documento durante todo el tratamiento.',
        { align: 'center', width: 495 },
      );
  }
}