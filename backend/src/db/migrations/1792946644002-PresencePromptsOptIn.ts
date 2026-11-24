import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ensures notification delivery is always preceded by explicit user consent. */
export class PresencePromptsOptIn1792946644002 implements MigrationInterface {
  name = 'PresencePromptsOptIn1792946644002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "presence_prompts_enabled" SET DEFAULT false`,
    );
    await queryRunner.query(`UPDATE "users" SET "presence_prompts_enabled" = false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "presence_prompts_enabled" SET DEFAULT true`,
    );
  }
}
