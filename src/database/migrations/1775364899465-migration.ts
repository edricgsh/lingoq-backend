import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775364899465 implements MigrationInterface {
    name = 'Migration1775364899465'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "lingoq"."session_summaries_proficiency_level_enum" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`);
        await queryRunner.query(`ALTER TABLE "session_summaries" ADD "proficiency_level" "lingoq"."session_summaries_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "session_summaries" ADD "user_id" character varying`);
        await queryRunner.query(`ALTER TABLE "session_summaries" ADD "custom_instructions" text`);
        await queryRunner.query(`ALTER TABLE "session_summaries" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`CREATE TYPE "lingoq"."learning_sessions_proficiency_level_enum" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`);
        await queryRunner.query(`ALTER TABLE "learning_sessions" ADD "proficiency_level" "lingoq"."learning_sessions_proficiency_level_enum"`);
        await queryRunner.query(`CREATE TYPE "lingoq"."homework_proficiency_level_enum" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`);
        await queryRunner.query(`ALTER TABLE "homework" ADD "proficiency_level" "lingoq"."homework_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "homework" ADD "user_id" character varying`);
        await queryRunner.query(`ALTER TABLE "homework" ADD "custom_instructions" text`);
        await queryRunner.query(`ALTER TABLE "homework" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`CREATE TYPE "lingoq"."vocab_items_proficiency_level_enum" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`);
        await queryRunner.query(`ALTER TABLE "vocab_items" ADD "proficiency_level" "lingoq"."vocab_items_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "vocab_items" ADD "user_id" character varying`);
        await queryRunner.query(`ALTER TABLE "vocab_items" ADD "custom_instructions" text`);
        await queryRunner.query(`ALTER TABLE "vocab_items" ADD "is_active" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vocab_items" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "vocab_items" DROP COLUMN "custom_instructions"`);
        await queryRunner.query(`ALTER TABLE "vocab_items" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "vocab_items" DROP COLUMN "proficiency_level"`);
        await queryRunner.query(`DROP TYPE "lingoq"."vocab_items_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "homework" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "homework" DROP COLUMN "custom_instructions"`);
        await queryRunner.query(`ALTER TABLE "homework" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "homework" DROP COLUMN "proficiency_level"`);
        await queryRunner.query(`DROP TYPE "lingoq"."homework_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "learning_sessions" DROP COLUMN "proficiency_level"`);
        await queryRunner.query(`DROP TYPE "lingoq"."learning_sessions_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "session_summaries" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "session_summaries" DROP COLUMN "custom_instructions"`);
        await queryRunner.query(`ALTER TABLE "session_summaries" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "session_summaries" DROP COLUMN "proficiency_level"`);
        await queryRunner.query(`DROP TYPE "lingoq"."session_summaries_proficiency_level_enum"`);
    }

}
