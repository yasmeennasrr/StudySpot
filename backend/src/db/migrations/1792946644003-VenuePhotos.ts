import { MigrationInterface, QueryRunner } from 'typeorm';

/** A photo for each venue, shown on lists and the details page (optional). */
export class VenuePhotos1792946644003 implements MigrationInterface {
  name = 'VenuePhotos1792946644003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" ADD "photo_url" character varying(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "photo_url"`);
  }
}
