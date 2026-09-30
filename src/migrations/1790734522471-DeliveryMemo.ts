import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeliveryMemo1790734522471 implements MigrationInterface {
  name = 'DeliveryMemo1790734522471';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD "memo" character varying(40)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "memo"`);
  }
}
