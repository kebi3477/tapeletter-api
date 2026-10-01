import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequestLogs1790839694535 implements MigrationInterface {
  name = 'RequestLogs1790839694535';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "request_logs" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "request_id" character varying(64) NOT NULL, "method" character varying(8) NOT NULL, "path" character varying(300) NOT NULL, "status" smallint NOT NULL, "duration_ms" integer NOT NULL, "user_id" uuid, "ip" character varying(64), "app_version" character varying(32), "platform" character varying(16), "user_agent" character varying(200), "error_code" character varying(64), "detail" text, CONSTRAINT "PK_1edd3815ae37a9b9511f5a26dca" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_request_logs_created_at" ON "request_logs"  ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_request_logs_request_id" ON "request_logs"  ("request_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_request_logs_user_id" ON "request_logs"  ("user_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_request_logs_user_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_request_logs_request_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_request_logs_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "request_logs"`);
  }
}
