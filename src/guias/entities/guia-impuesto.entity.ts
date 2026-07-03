import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'guiaimpuestos', schema: 'gde' })
export class GuiaImpuesto {
  @PrimaryColumn({ name: 'empkey', type: 'bigint' })
  empkey!: string;

  @PrimaryColumn({ name: 'guitipo', type: 'smallint' })
  guitipo!: number;

  @PrimaryColumn({ name: 'guifolio', type: 'bigint' })
  guifolio!: string;

  @PrimaryColumn({ name: 'guiimpcod', type: 'smallint' })
  guiimpcod!: number;

  @PrimaryColumn({ name: 'guiimpsubid', type: 'varchar' })
  guiimpsubid!: string;

  @Column({ name: 'guiimpmonto', type: 'bigint' })
  guiimpmonto!: string;
}
