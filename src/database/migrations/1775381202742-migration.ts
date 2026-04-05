import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775381202742 implements MigrationInterface {
    name = 'Migration1775381202742'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."session_notes" ADD COLUMN "title" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."session_notes" DROP COLUMN "title"`);
    }
}
