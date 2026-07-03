import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'guia', schema: 'gde' })
export class Guia {
  @PrimaryColumn({ name: 'empkey', type: 'bigint' })
  empkey!: string;

  @PrimaryColumn({ name: 'guitipo', type: 'smallint' })
  guitipo!: number;

  @PrimaryColumn({ name: 'guifolio', type: 'bigint' })
  guifolio!: string;

  @Column({ name: 'guiestadoregistro', type: 'varchar', length: 20 })
  guiestadoregistro!: string;

  @Column({ name: 'guiestadoacuse', type: 'varchar', length: 20 })
  guiestadoacuse!: string;

  @Column({ name: 'guiestadoanulacion', type: 'varchar', length: 20 })
  guiestadoanulacion!: string;

  @Column({ name: 'guisuccod', type: 'varchar' })
  guisuccod!: string;

  @Column({ name: 'guifechaemision', type: 'date' })
  guifechaemision!: string;

  @Column({ name: 'gclirut', type: 'varchar' })
  gclirut!: string;

  @Column({ name: 'guitotneto', type: 'bigint' })
  guitotneto!: string;

  @Column({ name: 'guitotexento', type: 'bigint' })
  guitotexento!: string;

  @Column({ name: 'guitotiva', type: 'bigint' })
  guitotiva!: string;

  @Column({ name: 'guiotrosimpuestos', type: 'bigint' })
  guiotrosimpuestos!: string;

  @Column({ name: 'guitotdoc', type: 'bigint' })
  guitotdoc!: string;

  @Column({ name: 'guiiddoc', type: 'varchar' })
  guiiddoc!: string;

  @Column({ name: 'guifilepath', type: 'varchar' })
  guifilepath!: string;

  @Column({ name: 'guiloteidl', type: 'varchar' })
  guiloteidl!: string;

  @Column({ name: 'guireglaidl', type: 'varchar', length: 200, nullable: true })
  guireglaidl!: string | null;

  @Column({ name: 'guivaloragrupador', type: 'varchar', length: 200, nullable: true })
  guivaloragrupador!: string | null;
}
