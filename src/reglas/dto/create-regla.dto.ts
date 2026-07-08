import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsArray,
  ArrayNotEmpty,
  ValidateIf,
} from 'class-validator';
import type { TipoReferenciaExterna } from '../../xml/xml-parser.utils.js';

export class CreateReglaDto {
  @IsString()
  @IsNotEmpty()
  reglaidl!: string;

  @IsString()
  @IsNotEmpty()
  regladescripcion!: string;

  @IsIn(['extraeTagLista', 'extraeReferenciaPorTipo'])
  fn!: 'extraeTagLista' | 'extraeReferenciaPorTipo';

  /** Tags XML a extraer, ej: ["CmnaRecep", "DirRecep"] — requerido si fn=extraeTagLista */
  @ValidateIf((dto: CreateReglaDto) => dto.fn === 'extraeTagLista')
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  reglaTags?: string[];

  /** Tipos de referencia externa a agrupar ('801'=OC, 'HES') — requerido si fn=extraeReferenciaPorTipo */
  @ValidateIf((dto: CreateReglaDto) => dto.fn === 'extraeReferenciaPorTipo')
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['801', 'HES'], { each: true })
  tiposReferencia?: TipoReferenciaExterna[];
}
