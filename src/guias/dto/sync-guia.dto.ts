import { IsString } from 'class-validator';

export class SyncGuiaDto {
  @IsString()
  empkey!: string;

  @IsString()
  rut!: string;

  @IsString()
  fechaInicial!: string;

  @IsString()
  fechaFinal!: string;
}
