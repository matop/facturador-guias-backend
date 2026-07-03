import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'facturaguias', schema: 'gde' })
export class FacturaGuia {
  @PrimaryColumn({ name: 'empkey', type: 'bigint' })
  empkey!: string;

  @PrimaryColumn({ name: 'gfackey', type: 'bigint' })
  gfackey!: string;

  @PrimaryColumn({ name: 'guitipo', type: 'smallint' })
  guitipo!: number;

  @PrimaryColumn({ name: 'guifolio', type: 'bigint' })
  guifolio!: string;
}
