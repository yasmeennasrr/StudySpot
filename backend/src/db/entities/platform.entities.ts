import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Security event log (SEC-010, FR-041, FR-044). Owner: M1 (AuditModule). */
@Entity({ name: 'audit_log' })
@Index('ix_audit_log_time', ['createdAt'])
@Index('ix_audit_log_action_time', ['action', 'createdAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: ['user', 'staff', 'system', 'anonymous'],
    enumName: 'audit_actor_type',
  })
  actorType: 'user' | 'staff' | 'system' | 'anonymous';

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  /** e.g. "auth.sign_in_failed", "staff.user_suspended". */
  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  target: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/** Current configurable values (DATA-012). Owner: M1 (ConfigurationModule). */
@Entity({ name: 'config_values' })
export class ConfigValueEntity {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}

/** Who changed which value, when, from what (DATA-012). */
@Entity({ name: 'config_history' })
@Index('ix_config_history_key_time', ['key', 'changedAt'])
export class ConfigHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  key: string;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue: unknown;

  @Column({ name: 'new_value', type: 'jsonb' })
  newValue: unknown;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy: string;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;
}
