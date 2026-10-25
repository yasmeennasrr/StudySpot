import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entities';
import { VenueEntity } from './venue.entities';

/**
 * Surveys, in-app and QR (CON-001..CON-008, DATA-004). The user reference is
 * used only for rewards, anti-abuse and moderation; never shown (PRIV-014).
 */
@Entity({ name: 'surveys' })
@Index('ix_surveys_venue_time', ['venueId', 'submittedAt'])
@Index('ix_surveys_user_time', ['userId', 'submittedAt'])
export class SurveyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id', foreignKeyConstraintName: 'fk_surveys_venue' })
  venue?: VenueEntity;

  /** Nullable so an account deletion can keep the anonymised survey (PRIV-012). */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_surveys_user' })
  user?: UserEntity;

  @Column({ type: 'enum', enum: ['qr', 'in_app'], enumName: 'survey_source' })
  source: 'qr' | 'in_app';

  @Column({
    name: 'crowd_answer',
    type: 'enum',
    enum: ['not_crowded', 'slightly_crowded', 'moderately_crowded', 'very_crowded'],
    enumName: 'crowd_answer',
    nullable: true,
  })
  crowdAnswer: string | null;

  @Column({
    name: 'noise_answer',
    type: 'enum',
    enum: ['quiet', 'moderate', 'noisy'],
    enumName: 'noise_answer',
    nullable: true,
  })
  noiseAnswer: string | null;

  @Column({
    name: 'wifi_answer',
    type: 'enum',
    enum: ['poor', 'average', 'good', 'not_used'],
    enumName: 'wifi_answer',
    nullable: true,
  })
  wifiAnswer: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;

  @Column({ name: 'points_awarded', type: 'integer', default: 0 })
  pointsAwarded: number;

  /** Why no points were given, shown to the user (SDS 6.6.5). */
  @Column({ name: 'no_points_reason', type: 'varchar', length: 120, nullable: true })
  noPointsReason: string | null;

  /** Set by a Moderator (FR-029). */
  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;
}

/**
 * Every input to a dynamic value (DATA-003, DATA-005). Purged after 90 days
 * (PRIV-013). Audio-derived noise rows store level + time + venue only (DATA-005).
 */
@Entity({ name: 'dynamic_records' })
@Index('ix_dynamic_records_lookup', ['venueId', 'conditionType', 'recordedAt'])
@Check('chk_dynamic_records_value', '"value" BETWEEN 1 AND 3')
export class DynamicRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id', foreignKeyConstraintName: 'fk_dynamic_records_venue' })
  venue?: VenueEntity;

  @Column({
    name: 'condition_type',
    type: 'enum',
    enum: ['crowd', 'noise', 'wifi'],
    enumName: 'condition_type',
  })
  conditionType: 'crowd' | 'noise' | 'wifi';

  /** Level 1..3 (SDS 6.6 numbering). */
  @Column({ type: 'smallint' })
  value: number;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: ['qr_survey', 'in_app_survey', 'audio_analysis', 'present_user_count'],
    enumName: 'dynamic_source_type',
  })
  sourceType: 'qr_survey' | 'in_app_survey' | 'audio_analysis' | 'present_user_count';

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;

  /** Link to the survey for survey rows; null for audio and presence rows. */
  @Column({ name: 'survey_id', type: 'uuid', nullable: true })
  surveyId: string | null;

  @ManyToOne(() => SurveyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id', foreignKeyConstraintName: 'fk_dynamic_records_survey' })
  survey?: SurveyEntity;
}

/** Raw presence reports, deleted after 2 hours (PRIV-016). Never shown to anyone (PRIV-007). */
@Entity({ name: 'presence_records' })
@Index('ix_presence_venue_time', ['venueId', 'recordedAt'])
@Index('ix_presence_user_time', ['userId', 'recordedAt'])
export class PresenceRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_presence_records_user' })
  user?: UserEntity;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id', foreignKeyConstraintName: 'fk_presence_records_venue' })
  venue?: VenueEntity;

  @Column({ type: 'enum', enum: ['location', 'receipt_scan'], enumName: 'presence_source' })
  source: 'location' | 'receipt_scan';

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;
}

/** One-time receipt codes (DATA-010, QR-001..QR-013). Token: 128 random bits, base64url (SDS 6.6.7). */
@Entity({ name: 'receipt_codes' })
@Index('ix_receipt_codes_status_created', ['status', 'createdAt'])
export class ReceiptCodeEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  token: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id', foreignKeyConstraintName: 'fk_receipt_codes_venue' })
  venue?: VenueEntity;

  @Column({ name: 'api_key_id', type: 'uuid', nullable: true })
  apiKeyId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'first_scan_at', type: 'timestamptz', nullable: true })
  firstScanAt: Date | null;

  @Column({ name: 'scanned_by_user_id', type: 'uuid', nullable: true })
  scannedByUserId: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'scanned_by_user_id', foreignKeyConstraintName: 'fk_receipt_codes_user' })
  scannedBy?: UserEntity;

  @Column({
    type: 'enum',
    enum: ['unused', 'scanned', 'used', 'expired'],
    enumName: 'receipt_code_status',
    default: 'unused',
  })
  status: 'unused' | 'scanned' | 'used' | 'expired';

  @Column({ name: 'survey_id', type: 'uuid', nullable: true })
  surveyId: string | null;

  @Column({ name: 'points_awarded', type: 'integer', default: 0 })
  pointsAwarded: number;
}

/** Venue API keys for the receipt-code API (FR-043, SEC-011). Only a hash is stored. */
@Entity({ name: 'venue_api_keys' })
export class VenueApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_venue_api_keys_venue')
  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id', foreignKeyConstraintName: 'fk_venue_api_keys_venue' })
  venue?: VenueEntity;

  @Index('uq_venue_api_keys_hash', { unique: true })
  @Column({ name: 'key_hash', type: 'varchar', length: 128 })
  keyHash: string;

  /** First characters shown in the staff console to tell keys apart. */
  @Column({ name: 'key_prefix', type: 'varchar', length: 12 })
  keyPrefix: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
