import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775380775952 implements MigrationInterface {
    name = 'Migration1775380775952'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "lingoq"."session_notes" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" character varying NOT NULL, "session_id" character varying NOT NULL, "content" text NOT NULL, CONSTRAINT "PK_c0c90f57f8af96a8b1252f86ef0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fa26672f546a451f255c30454d" ON "lingoq"."session_notes" ("user_id", "session_id") `);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_notes" ADD CONSTRAINT "FK_192d2c5fd04aa4e5fe56a6c029e" FOREIGN KEY ("session_id") REFERENCES "lingoq"."learning_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."session_notes" DROP CONSTRAINT "FK_192d2c5fd04aa4e5fe56a6c029e"`);
        await queryRunner.query(`DROP INDEX "lingoq"."IDX_fa26672f546a451f255c30454d"`);
        await queryRunner.query(`DROP TABLE "lingoq"."session_notes"`);
    }

}
