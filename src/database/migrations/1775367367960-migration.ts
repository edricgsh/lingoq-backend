import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775367367960 implements MigrationInterface {
    name = 'Migration1775367367960'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" DROP CONSTRAINT "FK_c5221055b51caad24dde1eb8ba9"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP CONSTRAINT "FK_fc5b58e2d4525fba53a946a383e"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP CONSTRAINT "FK_cb341c634d004b3df210b0cf009"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" RENAME COLUMN "proficiency_level" TO "active_content_version_id"`);
        await queryRunner.query(`ALTER TYPE "lingoq"."learning_sessions_proficiency_level_enum" RENAME TO "learning_sessions_active_content_version_id_enum"`);
        await queryRunner.query(`CREATE TYPE "lingoq"."content_versions_proficiency_level_enum" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`);
        await queryRunner.query(`CREATE TYPE "lingoq"."content_versions_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed')`);
        await queryRunner.query(`CREATE TABLE "lingoq"."content_versions" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "video_content_id" character varying NOT NULL, "proficiency_level" "lingoq"."content_versions_proficiency_level_enum", "user_id" character varying, "custom_instructions" text, "status" "lingoq"."content_versions_status_enum" NOT NULL DEFAULT 'pending', "error_message" text, CONSTRAINT "PK_77046b137eb8001947fc332e594" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" DROP COLUMN "video_content_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" DROP COLUMN "proficiency_level"`);
        await queryRunner.query(`DROP TYPE "lingoq"."vocab_items_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" DROP COLUMN "custom_instructions"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP COLUMN "video_content_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP COLUMN "proficiency_level"`);
        await queryRunner.query(`DROP TYPE "lingoq"."session_summaries_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP COLUMN "custom_instructions"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP COLUMN "video_content_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP COLUMN "proficiency_level"`);
        await queryRunner.query(`DROP TYPE "lingoq"."homework_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP COLUMN "custom_instructions"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" ADD "content_version_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD "content_version_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD CONSTRAINT "UQ_3ad5ff830fe56db188527baceed" UNIQUE ("content_version_id")`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_submissions" ADD "content_version_id" character varying`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD "content_version_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD CONSTRAINT "UQ_93436a423981d24987ccf282daf" UNIQUE ("content_version_id")`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" DROP COLUMN "active_content_version_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" ADD "active_content_version_id" character varying`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" ADD CONSTRAINT "UQ_af5b5c7ee86078321cc895ff52f" UNIQUE ("active_content_version_id")`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" ADD CONSTRAINT "FK_c6acba643bd359c330c9e4534d0" FOREIGN KEY ("content_version_id") REFERENCES "lingoq"."content_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD CONSTRAINT "FK_3ad5ff830fe56db188527baceed" FOREIGN KEY ("content_version_id") REFERENCES "lingoq"."content_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_submissions" ADD CONSTRAINT "FK_428a44364861cf3ec8e0d401aad" FOREIGN KEY ("content_version_id") REFERENCES "lingoq"."content_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD CONSTRAINT "FK_93436a423981d24987ccf282daf" FOREIGN KEY ("content_version_id") REFERENCES "lingoq"."content_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."content_versions" ADD CONSTRAINT "FK_fd4ab1cca968dc6257c7177e1a7" FOREIGN KEY ("video_content_id") REFERENCES "lingoq"."video_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" ADD CONSTRAINT "FK_af5b5c7ee86078321cc895ff52f" FOREIGN KEY ("active_content_version_id") REFERENCES "lingoq"."content_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" DROP CONSTRAINT "FK_af5b5c7ee86078321cc895ff52f"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."content_versions" DROP CONSTRAINT "FK_fd4ab1cca968dc6257c7177e1a7"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP CONSTRAINT "FK_93436a423981d24987ccf282daf"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_submissions" DROP CONSTRAINT "FK_428a44364861cf3ec8e0d401aad"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP CONSTRAINT "FK_3ad5ff830fe56db188527baceed"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" DROP CONSTRAINT "FK_c6acba643bd359c330c9e4534d0"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" DROP CONSTRAINT "UQ_af5b5c7ee86078321cc895ff52f"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" DROP COLUMN "active_content_version_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" ADD "active_content_version_id" "lingoq"."learning_sessions_active_content_version_id_enum"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP CONSTRAINT "UQ_93436a423981d24987ccf282daf"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP COLUMN "content_version_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_submissions" DROP COLUMN "content_version_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP CONSTRAINT "UQ_3ad5ff830fe56db188527baceed"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP COLUMN "content_version_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" DROP COLUMN "content_version_id"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD "custom_instructions" text`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD "user_id" character varying`);
        await queryRunner.query(`CREATE TYPE "lingoq"."homework_proficiency_level_enum" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD "proficiency_level" "lingoq"."homework_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD "video_content_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD "custom_instructions" text`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD "user_id" character varying`);
        await queryRunner.query(`CREATE TYPE "lingoq"."session_summaries_proficiency_level_enum" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD "proficiency_level" "lingoq"."session_summaries_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD "video_content_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" ADD "custom_instructions" text`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" ADD "user_id" character varying`);
        await queryRunner.query(`CREATE TYPE "lingoq"."vocab_items_proficiency_level_enum" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" ADD "proficiency_level" "lingoq"."vocab_items_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" ADD "video_content_id" character varying NOT NULL`);
        await queryRunner.query(`DROP TABLE "lingoq"."content_versions"`);
        await queryRunner.query(`DROP TYPE "lingoq"."content_versions_status_enum"`);
        await queryRunner.query(`DROP TYPE "lingoq"."content_versions_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TYPE "lingoq"."learning_sessions_active_content_version_id_enum" RENAME TO "learning_sessions_proficiency_level_enum"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" RENAME COLUMN "active_content_version_id" TO "proficiency_level"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD CONSTRAINT "FK_cb341c634d004b3df210b0cf009" FOREIGN KEY ("video_content_id") REFERENCES "lingoq"."video_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD CONSTRAINT "FK_fc5b58e2d4525fba53a946a383e" FOREIGN KEY ("video_content_id") REFERENCES "lingoq"."video_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" ADD CONSTRAINT "FK_c5221055b51caad24dde1eb8ba9" FOREIGN KEY ("video_content_id") REFERENCES "lingoq"."video_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
