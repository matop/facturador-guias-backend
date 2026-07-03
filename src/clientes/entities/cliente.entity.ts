import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'clientes', schema: 'gde' })
export class Cliente {
  @PrimaryColumn({ name: 'empkey', type: 'bigint' })
  empkey!: string;

  @PrimaryColumn({ name: 'gclirut', type: 'varchar' })
  gclirut!: string;

  @Column({ name: 'gclinom', type: 'varchar' })
  gclinom!: string;

  @Column({ name: 'reglaidl', type: 'varchar', nullable: true })
  reglaidl!: string | null;

  @Column({ name: 'modo_detalle', type: 'varchar', length: 20, nullable: true })
  modoDetalle!: 'SG' | 'POR_PRODUCTO' | null;
}
