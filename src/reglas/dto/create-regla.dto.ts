import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsArray,
  ArrayNotEmpty,
  ValidateIf,
} from 'class-validator';
import type { TipoReferenciaExterna } from '../../xml/xml-parser.utils.js';

const FUNCIONES_SOPORTADAS = [
  'extraeTagLista',
  'extraeReferenciaPorTipo',
] as const;

export class CreateReglaDto {
  @IsString()
  @IsNotEmpty()
  reglaidl!: string;

  @IsString()
  @IsNotEmpty()
  regladescripcion!: string;

  @IsIn(FUNCIONES_SOPORTADAS)
  fn!: (typeof FUNCIONES_SOPORTADAS)[number];

  /** Tags XML a extraer, ej: ["CmnaRecep", "DirRecep"] — requerido cuando fn = extraeTagLista */
  @ValidateIf((dto: CreateReglaDto) => dto.fn === 'extraeTagLista')
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  reglaTags?: string[];

  /** Tipos de referencia externa a agrupar (801=OC, HES) — requerido cuando fn = extraeReferenciaPorTipo */
  @ValidateIf((dto: CreateReglaDto) => dto.fn === 'extraeReferenciaPorTipo')
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['801', 'HES'], { each: true })
  tiposReferencia?: TipoReferenciaExterna[];
}
