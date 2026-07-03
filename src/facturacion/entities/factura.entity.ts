import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'factura', schema: 'gde' })
export class Factura {
  @PrimaryColumn({ name: 'empkey', type: 'bigint' })
  empkey!: string;

  @PrimaryColumn({ name: 'gfackey', type: 'bigint' })
  gfackey!: string;

  @Column({ name: 'gfactipo', type: 'varchar' })
  gfactipo!: string;

  @Column({ name: 'gfacfolio', type: 'bigint' })
  gfacfolio!: string;

  @Column({ name: 'gfacestadoregistro', type: 'varchar', length: 20 })
  gfacestadoregistro!: string;

  @Column({ name: 'gfacestadoanulacion', type: 'varchar', length: 20 })
  gfacestadoanulacion!: string;

  @Column({ name: 'gfacfecha', type: 'date' })
  gfacfecha!: string;

  @Column({ name: 'gfactotneto', type: 'bigint' })
  gfactotneto!: string;

  @Column({ name: 'gfactotexento', type: 'bigint' })
  gfactotexento!: string;

  @Column({ name: 'gfactotiva', type: 'bigint' })
  gfactotiva!: string;

  @Column({ name: 'gfactotimpuestos', type: 'bigint' })
  gfactotimpuestos!: string;

  @Column({ name: 'gfactotdoc', type: 'bigint' })
  gfactotdoc!: string;

  @Column({ name: 'gfacfilepath', type: 'varchar' })
  gfacfilepath!: string;

  @Column({ name: 'gfacloteidl', type: 'varchar' })
  gfacloteidl!: string;

  @Column({ name: 'gclirut', type: 'varchar' })
  gclirut!: string;

  @Column({ name: 'estado', type: 'varchar', length: 20, default: 'BORRADOR' })
  estado!: string;

  @Column({ name: 'es_proforma', type: 'boolean', default: false })
  esProforma!: boolean;

  @Column({ name: 'reglaidl', type: 'varchar', length: 200, nullable: true })
  reglaidl!: string | null;

  @Column({ name: 'gfacfolio_sii', type: 'int', nullable: true })
  gfacfolioSii!: number | null;

  @Column({ name: 'gfaclink_pdf', type: 'varchar', nullable: true })
  gfaclinkPdf!: string | null;

  @Column({ name: 'gfaclink_xml', type: 'varchar', nullable: true })
  gfaclinkXml!: string | null;

  @Column({ name: 'rut_emisor', type: 'varchar', length: 20, default: '' })
  rutEmisor!: string;
}
