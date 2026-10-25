import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial StudySpot schema (SRS DATA-001..DATA-012). Generated from the entities
 * in src/db/entities, then extended with what TypeORM cannot express:
 * extensions, the trigram name index and the one-award-per-survey index.
 * Never edit a migration that has run on a shared database; add a new one.
 */

export class InitialSchema1792946643956 implements MigrationInterface {
  name = 'InitialSchema1792946643956';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
    await queryRunner.query(
      `CREATE TYPE "public"."user_role" AS ENUM('user', 'admin', 'moderator')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(254) NOT NULL, "password_hash" character varying(255) NOT NULL, "display_name" character varying(30) NOT NULL, "terms_accepted_at" TIMESTAMP WITH TIME ZONE NOT NULL, "role" "public"."user_role" NOT NULL DEFAULT 'user', "suspended" boolean NOT NULL DEFAULT false, "points_balance" integer NOT NULL DEFAULT '0', "presence_prompts_enabled" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_users_points_nonnegative" CHECK ("points_balance" >= 0), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email") `);
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "refresh_token_hash" character varying(128) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_used_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_sessions_user" ON "sessions" ("user_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_sessions_token_hash" ON "sessions" ("refresh_token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "device_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token" character varying(512) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_84700be257607cfb1f9dc2e52c3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_device_tokens_user" ON "device_tokens" ("user_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_device_tokens_token" ON "device_tokens" ("token") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."study_type" AS ENUM('individual', 'group', 'both')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."venue_size_class" AS ENUM('small', 'medium', 'large')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."venue_source" AS ENUM('team', 'maps')`);
    await queryRunner.query(
      `CREATE TABLE "venues" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120) NOT NULL, "location" geography(Point,4326) NOT NULL, "address" character varying(255), "area" character varying(80), "opening_hours" jsonb, "price_level" smallint, "wifi_available" boolean, "outlets_available" boolean, "study_type" "public"."study_type", "size_class" "public"."venue_size_class" NOT NULL DEFAULT 'medium', "source" "public"."venue_source" NOT NULL DEFAULT 'team', "external_place_id" character varying(255), "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_venues_price_level" CHECK ("price_level" IS NULL OR "price_level" BETWEEN 1 AND 4), CONSTRAINT "PK_cb0f885278d12384eb7a81818be" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_venues_location" ON "venues" USING GiST ("location") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" uuid NOT NULL, "user_id" uuid NOT NULL, "rating" smallint NOT NULL, "text" text, "removed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_reviews_text_length" CHECK ("text" IS NULL OR char_length("text") <= 1000), CONSTRAINT "chk_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_reviews_venue" ON "reviews" ("venue_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reviews_venue_user" ON "reviews" ("venue_id", "user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "review_reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "review_id" uuid NOT NULL, "reporter_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_173974ee185c21487767bdb54dc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_review_reports_review_reporter" ON "review_reports" ("review_id", "reporter_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_preferences" ("user_id" uuid NOT NULL, "criteria" jsonb NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_458057fa75b66e68a275647da2e" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "favorites" ("user_id" uuid NOT NULL, "venue_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f908f56271f0c42c7597afecce7" PRIMARY KEY ("user_id", "venue_id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."survey_source" AS ENUM('qr', 'in_app')`);
    await queryRunner.query(
      `CREATE TYPE "public"."crowd_answer" AS ENUM('not_crowded', 'slightly_crowded', 'moderately_crowded', 'very_crowded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."noise_answer" AS ENUM('quiet', 'moderate', 'noisy')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."wifi_answer" AS ENUM('poor', 'average', 'good', 'not_used')`,
    );
    await queryRunner.query(
      `CREATE TABLE "surveys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" uuid NOT NULL, "user_id" uuid, "source" "public"."survey_source" NOT NULL, "crowd_answer" "public"."crowd_answer", "noise_answer" "public"."noise_answer", "wifi_answer" "public"."wifi_answer", "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL, "points_awarded" integer NOT NULL DEFAULT '0', "no_points_reason" character varying(120), "removed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_1b5e3d4aaeb2321ffa98498c971" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_surveys_user_time" ON "surveys" ("user_id", "submitted_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_surveys_venue_time" ON "surveys" ("venue_id", "submitted_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."condition_type" AS ENUM('crowd', 'noise', 'wifi')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dynamic_source_type" AS ENUM('qr_survey', 'in_app_survey', 'audio_analysis', 'present_user_count')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dynamic_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" uuid NOT NULL, "condition_type" "public"."condition_type" NOT NULL, "value" smallint NOT NULL, "source_type" "public"."dynamic_source_type" NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, "survey_id" uuid, CONSTRAINT "chk_dynamic_records_value" CHECK ("value" BETWEEN 1 AND 3), CONSTRAINT "PK_106f4a2700c4a4415a9ffb4115e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_dynamic_records_lookup" ON "dynamic_records" ("venue_id", "condition_type", "recorded_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."presence_source" AS ENUM('location', 'receipt_scan')`,
    );
    await queryRunner.query(
      `CREATE TABLE "presence_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "venue_id" uuid NOT NULL, "source" "public"."presence_source" NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_ae513fc12b1f302c0accbd3edae" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_presence_user_time" ON "presence_records" ("user_id", "recorded_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_presence_venue_time" ON "presence_records" ("venue_id", "recorded_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."receipt_code_status" AS ENUM('unused', 'scanned', 'used', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TABLE "receipt_codes" ("token" character varying(32) NOT NULL, "venue_id" uuid NOT NULL, "api_key_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "first_scan_at" TIMESTAMP WITH TIME ZONE, "scanned_by_user_id" uuid, "status" "public"."receipt_code_status" NOT NULL DEFAULT 'unused', "survey_id" uuid, "points_awarded" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_f6d9d68ed8c17334dd62347aa1b" PRIMARY KEY ("token"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_receipt_codes_status_created" ON "receipt_codes" ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "venue_api_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" uuid NOT NULL, "key_hash" character varying(128) NOT NULL, "key_prefix" character varying(12) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a605cd3c815ad191a90165fbed2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_venue_api_keys_venue" ON "venue_api_keys" ("venue_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_venue_api_keys_hash" ON "venue_api_keys" ("key_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "coupon_offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" uuid NOT NULL, "reward" character varying(120) NOT NULL, "point_cost" integer NOT NULL, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_coupon_offers_cost" CHECK ("point_cost" > 0), CONSTRAINT "PK_ef032491d8248368a06843944dd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_coupon_offers_venue" ON "coupon_offers" ("venue_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."coupon_status" AS ENUM('issued', 'active', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."coupon_email_status" AS ENUM('pending', 'sent', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(9) NOT NULL, "offer_id" uuid NOT NULL, "reward" character varying(120) NOT NULL, "venue_id" uuid NOT NULL, "owner_user_id" uuid NOT NULL, "point_cost" integer NOT NULL, "redeemed_at" TIMESTAMP WITH TIME ZONE NOT NULL, "activation_token_hash" character varying(128) NOT NULL, "activated_at" TIMESTAMP WITH TIME ZONE, "status" "public"."coupon_status" NOT NULL DEFAULT 'issued', "email_status" "public"."coupon_email_status" NOT NULL DEFAULT 'pending', "email_attempts" smallint NOT NULL DEFAULT '0', "next_email_attempt_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d7ea8864a0150183770f3e9a8cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_coupons_code" ON "coupons" ("code") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_coupons_activation_hash" ON "coupons" ("activation_token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_coupons_email_retry" ON "coupons" ("email_status", "next_email_attempt_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_coupons_owner" ON "coupons" ("owner_user_id", "redeemed_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."points_reason" AS ENUM('survey_award', 'coupon_redemption', 'no_award')`,
    );
    await queryRunner.query(
      `CREATE TABLE "points_ledger" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "delta" integer NOT NULL, "reason" "public"."points_reason" NOT NULL, "survey_id" uuid, "coupon_id" uuid, "note" character varying(200), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1894c07f712716bfe637e82cc05" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_points_ledger_user_time" ON "points_ledger" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'staff', 'system', 'anonymous')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_type" "public"."audit_actor_type" NOT NULL, "actor_id" uuid, "action" character varying(80) NOT NULL, "target" character varying(255), "details" jsonb, "ip" character varying(64), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_action_time" ON "audit_log" ("action", "created_at") `,
    );
    await queryRunner.query(`CREATE INDEX "ix_audit_log_time" ON "audit_log" ("created_at") `);
    await queryRunner.query(
      `CREATE TABLE "config_values" ("key" character varying(80) NOT NULL, "value" jsonb NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" uuid, CONSTRAINT "PK_01e24fbae035ab608396db6567f" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "config_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(80) NOT NULL, "old_value" jsonb, "new_value" jsonb NOT NULL, "changed_by" uuid NOT NULL, "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b137538bf5fbbee4d7640931323" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_config_history_key_time" ON "config_history" ("key", "changed_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "device_tokens" ADD CONSTRAINT "fk_device_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "fk_reviews_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "fk_reviews_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_reports" ADD CONSTRAINT "fk_review_reports_review" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_reports" ADD CONSTRAINT "fk_review_reports_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "fk_user_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorites" ADD CONSTRAINT "fk_favorites_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorites" ADD CONSTRAINT "fk_favorites_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "fk_surveys_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "fk_surveys_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_records" ADD CONSTRAINT "fk_dynamic_records_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_records" ADD CONSTRAINT "fk_dynamic_records_survey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "presence_records" ADD CONSTRAINT "fk_presence_records_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "presence_records" ADD CONSTRAINT "fk_presence_records_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_codes" ADD CONSTRAINT "fk_receipt_codes_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_codes" ADD CONSTRAINT "fk_receipt_codes_user" FOREIGN KEY ("scanned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "venue_api_keys" ADD CONSTRAINT "fk_venue_api_keys_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_offers" ADD CONSTRAINT "fk_coupon_offers_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD CONSTRAINT "fk_coupons_offer" FOREIGN KEY ("offer_id") REFERENCES "coupon_offers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD CONSTRAINT "fk_coupons_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD CONSTRAINT "fk_coupons_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "points_ledger" ADD CONSTRAINT "fk_points_ledger_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "points_ledger" ADD CONSTRAINT "fk_points_ledger_survey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "points_ledger" ADD CONSTRAINT "fk_points_ledger_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // Fast name search (FR-009): ILIKE '%text%' uses this trigram index.
    await queryRunner.query(
      `CREATE INDEX "ix_venues_name_trgm" ON "venues" USING GIN ("name" gin_trgm_ops)`,
    );
    // RWD-011: a survey earns points at most once.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_points_ledger_survey_award" ON "points_ledger" ("survey_id") WHERE "reason" = 'survey_award'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."uq_points_ledger_survey_award"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."ix_venues_name_trgm"`);
    await queryRunner.query(
      `ALTER TABLE "points_ledger" DROP CONSTRAINT "fk_points_ledger_coupon"`,
    );
    await queryRunner.query(
      `ALTER TABLE "points_ledger" DROP CONSTRAINT "fk_points_ledger_survey"`,
    );
    await queryRunner.query(`ALTER TABLE "points_ledger" DROP CONSTRAINT "fk_points_ledger_user"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP CONSTRAINT "fk_coupons_owner"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP CONSTRAINT "fk_coupons_venue"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP CONSTRAINT "fk_coupons_offer"`);
    await queryRunner.query(`ALTER TABLE "coupon_offers" DROP CONSTRAINT "fk_coupon_offers_venue"`);
    await queryRunner.query(
      `ALTER TABLE "venue_api_keys" DROP CONSTRAINT "fk_venue_api_keys_venue"`,
    );
    await queryRunner.query(`ALTER TABLE "receipt_codes" DROP CONSTRAINT "fk_receipt_codes_user"`);
    await queryRunner.query(`ALTER TABLE "receipt_codes" DROP CONSTRAINT "fk_receipt_codes_venue"`);
    await queryRunner.query(
      `ALTER TABLE "presence_records" DROP CONSTRAINT "fk_presence_records_venue"`,
    );
    await queryRunner.query(
      `ALTER TABLE "presence_records" DROP CONSTRAINT "fk_presence_records_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_records" DROP CONSTRAINT "fk_dynamic_records_survey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_records" DROP CONSTRAINT "fk_dynamic_records_venue"`,
    );
    await queryRunner.query(`ALTER TABLE "surveys" DROP CONSTRAINT "fk_surveys_user"`);
    await queryRunner.query(`ALTER TABLE "surveys" DROP CONSTRAINT "fk_surveys_venue"`);
    await queryRunner.query(`ALTER TABLE "favorites" DROP CONSTRAINT "fk_favorites_venue"`);
    await queryRunner.query(`ALTER TABLE "favorites" DROP CONSTRAINT "fk_favorites_user"`);
    await queryRunner.query(
      `ALTER TABLE "user_preferences" DROP CONSTRAINT "fk_user_preferences_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_reports" DROP CONSTRAINT "fk_review_reports_reporter"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_reports" DROP CONSTRAINT "fk_review_reports_review"`,
    );
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "fk_reviews_user"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "fk_reviews_venue"`);
    await queryRunner.query(`ALTER TABLE "device_tokens" DROP CONSTRAINT "fk_device_tokens_user"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "fk_sessions_user"`);
    await queryRunner.query(`DROP INDEX "public"."ix_config_history_key_time"`);
    await queryRunner.query(`DROP TABLE "config_history"`);
    await queryRunner.query(`DROP TABLE "config_values"`);
    await queryRunner.query(`DROP INDEX "public"."ix_audit_log_time"`);
    await queryRunner.query(`DROP INDEX "public"."ix_audit_log_action_time"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP TYPE "public"."audit_actor_type"`);
    await queryRunner.query(`DROP INDEX "public"."ix_points_ledger_user_time"`);
    await queryRunner.query(`DROP TABLE "points_ledger"`);
    await queryRunner.query(`DROP TYPE "public"."points_reason"`);
    await queryRunner.query(`DROP INDEX "public"."ix_coupons_owner"`);
    await queryRunner.query(`DROP INDEX "public"."ix_coupons_email_retry"`);
    await queryRunner.query(`DROP INDEX "public"."uq_coupons_activation_hash"`);
    await queryRunner.query(`DROP INDEX "public"."uq_coupons_code"`);
    await queryRunner.query(`DROP TABLE "coupons"`);
    await queryRunner.query(`DROP TYPE "public"."coupon_email_status"`);
    await queryRunner.query(`DROP TYPE "public"."coupon_status"`);
    await queryRunner.query(`DROP INDEX "public"."ix_coupon_offers_venue"`);
    await queryRunner.query(`DROP TABLE "coupon_offers"`);
    await queryRunner.query(`DROP INDEX "public"."uq_venue_api_keys_hash"`);
    await queryRunner.query(`DROP INDEX "public"."ix_venue_api_keys_venue"`);
    await queryRunner.query(`DROP TABLE "venue_api_keys"`);
    await queryRunner.query(`DROP INDEX "public"."ix_receipt_codes_status_created"`);
    await queryRunner.query(`DROP TABLE "receipt_codes"`);
    await queryRunner.query(`DROP TYPE "public"."receipt_code_status"`);
    await queryRunner.query(`DROP INDEX "public"."ix_presence_venue_time"`);
    await queryRunner.query(`DROP INDEX "public"."ix_presence_user_time"`);
    await queryRunner.query(`DROP TABLE "presence_records"`);
    await queryRunner.query(`DROP TYPE "public"."presence_source"`);
    await queryRunner.query(`DROP INDEX "public"."ix_dynamic_records_lookup"`);
    await queryRunner.query(`DROP TABLE "dynamic_records"`);
    await queryRunner.query(`DROP TYPE "public"."dynamic_source_type"`);
    await queryRunner.query(`DROP TYPE "public"."condition_type"`);
    await queryRunner.query(`DROP INDEX "public"."ix_surveys_venue_time"`);
    await queryRunner.query(`DROP INDEX "public"."ix_surveys_user_time"`);
    await queryRunner.query(`DROP TABLE "surveys"`);
    await queryRunner.query(`DROP TYPE "public"."wifi_answer"`);
    await queryRunner.query(`DROP TYPE "public"."noise_answer"`);
    await queryRunner.query(`DROP TYPE "public"."crowd_answer"`);
    await queryRunner.query(`DROP TYPE "public"."survey_source"`);
    await queryRunner.query(`DROP TABLE "favorites"`);
    await queryRunner.query(`DROP TABLE "user_preferences"`);
    await queryRunner.query(`DROP INDEX "public"."uq_review_reports_review_reporter"`);
    await queryRunner.query(`DROP TABLE "review_reports"`);
    await queryRunner.query(`DROP INDEX "public"."uq_reviews_venue_user"`);
    await queryRunner.query(`DROP INDEX "public"."ix_reviews_venue"`);
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(`DROP INDEX "public"."ix_venues_location"`);
    await queryRunner.query(`DROP TABLE "venues"`);
    await queryRunner.query(`DROP TYPE "public"."venue_source"`);
    await queryRunner.query(`DROP TYPE "public"."venue_size_class"`);
    await queryRunner.query(`DROP TYPE "public"."study_type"`);
    await queryRunner.query(`DROP INDEX "public"."uq_device_tokens_token"`);
    await queryRunner.query(`DROP INDEX "public"."ix_device_tokens_user"`);
    await queryRunner.query(`DROP TABLE "device_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."uq_sessions_token_hash"`);
    await queryRunner.query(`DROP INDEX "public"."ix_sessions_user"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_role"`);
  }
}
