import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1774629814396 implements MigrationInterface {
    name = 'Migration1774629814396'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "lingoq"."explore_topic_queries" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "topic" character varying NOT NULL, "target_language" character varying NOT NULL, "queries" jsonb NOT NULL DEFAULT '[]', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_62f8ea0d7d931c9d2438945f037" UNIQUE ("topic", "target_language"), CONSTRAINT "PK_5216b2518e6e58c15c577bedbd6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."explore_recommendations" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "topic" character varying NOT NULL, "target_language" character varying NOT NULL, "video_id" character varying NOT NULL, "title" character varying, "description" text, "thumbnail_url" character varying, "view_count" bigint, "upload_date" character varying, "channel_name" text, "channel_id" text, "duration" integer, CONSTRAINT "PK_9597f38347641648f52c9b69791" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "lingoq"."user_onboarding" ADD "interest_topics" jsonb NOT NULL DEFAULT '[]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."user_onboarding" DROP COLUMN "interest_topics"`);
        await queryRunner.query(`DROP TABLE "lingoq"."explore_recommendations"`);
        await queryRunner.query(`DROP TABLE "lingoq"."explore_topic_queries"`);
    }

}
