import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775269268057 implements MigrationInterface {
    name = 'Migration1775269268057'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."user_onboarding" ADD "has_seen_tour" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."user_onboarding" DROP COLUMN "has_seen_tour"`);
    }

}
