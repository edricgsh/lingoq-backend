import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775371158926 implements MigrationInterface {
    name = 'Migration1775371158926'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_0e4a606a6085e69ab91d22d731" ON "lingoq"."content_versions" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "lingoq"."IDX_0e4a606a6085e69ab91d22d731"`);
    }

}
