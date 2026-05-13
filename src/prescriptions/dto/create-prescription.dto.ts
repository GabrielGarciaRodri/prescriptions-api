import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PrescriptionItemDto {
  @IsString()
  @MinLength(2, { message: 'El nombre del medicamento debe tener al menos 2 caracteres' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dosage?: string;

  @IsOptional()
  @IsInt()
  @IsPositive({ message: 'La cantidad debe ser un entero positivo' })
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  instructions?: string;
}

export class CreatePrescriptionDto {
  @IsString()
  @IsNotEmpty({ message: 'El paciente es requerido' })
  patientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un medicamento' })
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
}