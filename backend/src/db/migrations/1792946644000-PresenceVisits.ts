import { MigrationInterface, QueryRunner } from 'typeorm';

/** Stores short-lived venue candidates for PB-31 dwell prompts (PB-18). */
export class PresenceVisits1792946644000 implements MigrationInterface {
  name = 'PresenceVisits1792946644000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "presence_visits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "venue_id" uuid NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "prompted_at" TIMESTAMP WITH TIME ZONE,
        "confirmed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_presence_visits" PRIMARY KEY ("id"),
        CONSTRAINT "fk_presence_visits_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_presence_visits_venue" FOREIGN KEY ("venue_id")
          REFERENCES "venues"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_presence_visits_active_seen" ON "presence_visits" ("active", "last_seen_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_presence_visits_active_user" ON "presence_visits" ("user_id") WHERE "active" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "presence_visits"`);
  }
}
