import { Entity, PrimaryColumn, Column } from 'typeorm';
import type { ReglaConfig } from '../parsers/regla-config.types.js';

@Entity({ name: 'regla', schema: 'gde' })
export class Regla {
  @PrimaryColumn({ name: 'reglaidl', type: 'varchar' })
  reglaidl!: string;

  @Column({ name: 'regladescripcion', type: 'varchar' })
  regladescripcion!: string;

  @Column({ name: 'reglaconfig', type: 'jsonb' })
  reglaconfig!: ReglaConfig;
}
