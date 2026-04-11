import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775878519978 implements MigrationInterface {
    name = 'Migration1775878519978'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."explore_topic_queries" ADD "query_fetched_at" jsonb NOT NULL DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."explore_topic_queries" DROP COLUMN "query_fetched_at"`);
    }

}
