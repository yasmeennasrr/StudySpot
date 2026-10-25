import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Accounts (FR-001, SEC-002, FR-035..FR-038, RWD-003, RWD-009). Owner of the logic: M2. */
@Entity({ name: 'users' })
@Check('chk_users_points_nonnegative', '"points_balance" >= 0')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stored lower-cased; unique and case-insensitive (SDS 6.6.6). */
  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'display_name', type: 'varchar', length: 30 })
  displayName: string;

  @Column({ name: 'terms_accepted_at', type: 'timestamptz' })
  termsAcceptedAt: Date;

  @Column({
    type: 'enum',
    enum: ['user', 'admin', 'moderator'],
    enumName: 'user_role',
    default: 'user',
  })
  role: 'user' | 'admin' | 'moderator';

  @Column({ type: 'boolean', default: false })
  suspended: boolean;

  /** RWD-003; never negative (RWD-009, CHECK constraint above). */
  @Column({ name: 'points_balance', type: 'integer', default: 0 })
  pointsBalance: number;

  @Column({ name: 'presence_prompts_enabled', type: 'boolean', default: true })
  presencePromptsEnabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/** Refresh-token sessions; idle for 14 days = expired (SEC-009). */
@Entity({ name: 'sessions' })
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_sessions_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_sessions_user' })
  user?: UserEntity;

  @Index('uq_sessions_token_hash', { unique: true })
  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 128 })
  refreshTokenHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz' })
  lastUsedAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}

/** Push device tokens for presence prompts (EIR-007, Sprint 3). */
@Entity({ name: 'device_tokens' })
export class DeviceTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_device_tokens_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_device_tokens_user' })
  user?: UserEntity;

  @Index('uq_device_tokens_token', { unique: true })
  @Column({ type: 'varchar', length: 512 })
  token: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
