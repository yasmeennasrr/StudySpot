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
  UpdateDateColumn,
} from 'typeorm';
import type { Point } from 'geojson';
import type { FilterCriteria, OpeningHours } from '../../contracts/domain.types';
import { UserEntity } from './user.entities';

/**
 * Study locations (DATA-001, DATA-002, DATA-009). Static fields are entered by
 * the team outside the app (A-004) through the seed script. Logic owners: M3, M4.
 */
@Entity({ name: 'venues' })
/** GIN trigram index for name search (FR-009); created in the migration. */
@Index('ix_venues_name_trgm', { synchronize: false })
@Check('chk_venues_price_level', '"price_level" IS NULL OR "price_level" BETWEEN 1 AND 4')
export class VenueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** WGS84 point. Query with ST_DWithin / ST_Distance on geography (metres). */
  @Index('ix_venues_location', { spatial: true })
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  location: Point;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  /** Neighbourhood for display and area search, e.g. "New Cairo", "Zamalek". */
  @Column({ type: 'varchar', length: 80, nullable: true })
  area: string | null;

  @Column({ name: 'opening_hours', type: 'jsonb', nullable: true })
  openingHours: OpeningHours | null;

  /** 1 = cheap .. 4 = expensive. */
  @Column({ name: 'price_level', type: 'smallint', nullable: true })
  priceLevel: number | null;

  @Column({ name: 'wifi_available', type: 'boolean', nullable: true })
  wifiAvailable: boolean | null;

  @Column({ name: 'outlets_available', type: 'boolean', nullable: true })
  outletsAvailable: boolean | null;

  @Column({
    name: 'study_type',
    type: 'enum',
    enum: ['individual', 'group', 'both'],
    enumName: 'study_type',
    nullable: true,
  })
  studyType: 'individual' | 'group' | 'both' | null;

  /** Crowd thresholds per size class (RT-020). Default medium (SDS 6.6.1). */
  @Column({
    name: 'size_class',
    type: 'enum',
    enum: ['small', 'medium', 'large'],
    enumName: 'venue_size_class',
    default: 'medium',
  })
  sizeClass: 'small' | 'medium' | 'large';

  /** DATA-009: where the record came from. */
  @Column({ type: 'enum', enum: ['team', 'maps'], enumName: 'venue_source', default: 'team' })
  source: 'team' | 'maps';

  @Column({ name: 'external_place_id', type: 'varchar', length: 255, nullable: true })
  externalPlaceId: string | null;

  /** A deactivated venue is hidden and its receipt codes are rejected (QR-013). */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

/** One review per user per venue; resubmitting replaces it (SDS 6.6.6, DATA-007). */
@Entity({ name: 'reviews' })
@Index('uq_reviews_venue_user', ['venueId', 'userId'], { unique: true })
@Check('chk_reviews_rating', '"rating" BETWEEN 1 AND 5')
@Check('chk_reviews_text_length', '"text" IS NULL OR char_length("text") <= 1000')
export class ReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_reviews_venue')
  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id', foreignKeyConstraintName: 'fk_reviews_venue' })
  venue?: VenueEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_reviews_user' })
  user?: UserEntity;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  /** Set by a Moderator (FR-029); removed reviews are hidden. */
  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

/** Reports of inappropriate reviews (FR-034). */
@Entity({ name: 'review_reports' })
@Index('uq_review_reports_review_reporter', ['reviewId', 'reporterId'], { unique: true })
export class ReviewReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'review_id', type: 'uuid' })
  reviewId: string;

  @ManyToOne(() => ReviewEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id', foreignKeyConstraintName: 'fk_review_reports_review' })
  review?: ReviewEntity;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id', foreignKeyConstraintName: 'fk_review_reports_reporter' })
  reporter?: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/** Study preferences, one row per user, criteria of FR-013 (FR-022..FR-024). */
@Entity({ name: 'user_preferences' })
export class UserPreferencesEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_user_preferences_user' })
  user?: UserEntity;

  @Column({ type: 'jsonb' })
  criteria: FilterCriteria;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

/** Favorites (FR-026, FR-027). */
@Entity({ name: 'favorites' })
export class FavoriteEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_favorites_user' })
  user?: UserEntity;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id', foreignKeyConstraintName: 'fk_favorites_venue' })
  venue?: VenueEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
