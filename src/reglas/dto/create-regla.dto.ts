import { IsString, IsNotEmpty, IsIn, IsArray, ArrayNotEmpty } from 'class-validator';

export class CreateReglaDto {
  @IsString()
  @IsNotEmpty()
  reglaidl!: string;

  @IsString()
  @IsNotEmpty()
  regladescripcion!: string;

  /** Hoy la única función soportada es extraeTagLista */
  @IsIn(['extraeTagLista'])
  fn!: 'extraeTagLista';

  /** Tags XML a extraer, ej: ["CmnaRecep", "DirRecep"] */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  reglaTags!: string[];
}
