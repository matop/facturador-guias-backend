import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'reglaempresa', schema: 'gde' })
export class ReglaEmpresa {
  @PrimaryColumn({ name: 'empkey', type: 'bigint' })
  empkey!: string;

  @PrimaryColumn({ name: 'reglaidl', type: 'varchar' })
  reglaidl!: string;
}
