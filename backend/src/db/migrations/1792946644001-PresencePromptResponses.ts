import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tracks whether a user already answered the prompt for a candidate visit. */
export class PresencePromptResponses1792946644001 implements MigrationInterface {
  name = 'PresencePromptResponses1792946644001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "presence_visits" ADD "responded_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "presence_visits" DROP COLUMN "responded_at"`);
  }
}
