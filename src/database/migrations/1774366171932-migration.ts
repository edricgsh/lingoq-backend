import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1774366171932 implements MigrationInterface {
    name = 'Migration1774366171932'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "lingoq"."homework_questions_question_type_enum" AS ENUM('comprehension', 'fill_in_blank', 'free_writing', 'multiple_choice')`);
        await queryRunner.query(`CREATE TYPE "lingoq"."user_onboarding_proficiency_level_enum" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`);
        await queryRunner.query(`CREATE TYPE "lingoq"."users_role_enum" AS ENUM('USER', 'ADMIN')`);
        await queryRunner.query(`CREATE TYPE "lingoq"."video_content_job_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed')`);
        await queryRunner.query(`CREATE TABLE "lingoq"."session_summaries" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "video_content_id" character varying NOT NULL, "summary_target_lang" text, "key_phrases" jsonb, CONSTRAINT "PK_09917dcbdcc0af877fc75ac3d23" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."homework_questions" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "homework_id" character varying NOT NULL, "question_type" "lingoq"."homework_questions_question_type_enum" NOT NULL, "question_text" text NOT NULL, "expected_answer" text, "options" jsonb, "correct_answer" text, "order_index" integer NOT NULL DEFAULT '0', "video_hint_url" text, CONSTRAINT "PK_7169ca8ada57de05a43fc73cd0a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."homework_answers" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "submission_id" character varying NOT NULL, "question_id" character varying NOT NULL, "answer_text" text NOT NULL, "is_correct" boolean, "feedback" text, "corrected_text" text, "score" integer, CONSTRAINT "PK_6538c9a3a171e7920406c1ce40f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."user_onboarding" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" character varying NOT NULL, "is_complete" boolean NOT NULL DEFAULT false, "native_language" character varying, "target_language" character varying, "proficiency_level" "lingoq"."user_onboarding_proficiency_level_enum", "learning_goals" text, CONSTRAINT "REL_c604dd5a66a24d79b1ec42f4e5" UNIQUE ("user_id"), CONSTRAINT "PK_257c3b267f3b16db9ec6122d10d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."users" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "cognito_id" character varying NOT NULL, "email" character varying NOT NULL, "name" character varying, "is_active" boolean NOT NULL DEFAULT true, "role" "lingoq"."users_role_enum" NOT NULL DEFAULT 'USER', CONSTRAINT "UQ_d9dea74916617da4a95c8cce52a" UNIQUE ("cognito_id"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."learning_sessions" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" character varying NOT NULL, "video_content_id" character varying NOT NULL, CONSTRAINT "PK_35638efbb9078de611aa9cc3ecd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."homework_submissions" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "homework_id" character varying NOT NULL, "question_id" character varying NOT NULL, "user_id" character varying NOT NULL, "user_session_id" character varying, "score" integer, "overall_feedback" text, "submitted_at" TIMESTAMP, CONSTRAINT "PK_4c570ffb4ce1a34b63afa9d1b26" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."homework" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "video_content_id" character varying NOT NULL, CONSTRAINT "PK_90dbf463ef94040ed137c4fd38d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."video_content" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "youtube_video_id" character varying NOT NULL, "youtube_url" character varying NOT NULL, "title" character varying, "thumbnail_url" character varying, "subtitles_vtt" text, "job_status" "lingoq"."video_content_job_status_enum" NOT NULL DEFAULT 'pending', "pg_boss_job_id" character varying, "error_message" text, CONSTRAINT "UQ_6eb55641820b79dc8a480e2b4e8" UNIQUE ("youtube_video_id"), CONSTRAINT "PK_034a47cda43ebb534b6d390e8da" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."vocab_items" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "video_content_id" character varying NOT NULL, "word" character varying NOT NULL, "part_of_speech" character varying, "definition" jsonb, "examples" jsonb, "audio_url" character varying, CONSTRAINT "PK_f9e5410444d1604612156f66a44" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lingoq"."subtitle_cache" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "youtube_video_id" character varying NOT NULL, "subtitles" text NOT NULL, "subtitles_vtt" text, "language" character varying, "title" character varying, "spoken_language" character varying, CONSTRAINT "PK_d2729f3acfc1a31174855ebdb89" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7c48e7329ed12a1c6d30c1b006" ON "lingoq"."subtitle_cache" ("youtube_video_id") `);
        await queryRunner.query(`CREATE TABLE "lingoq"."flashcard_settings" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" character varying NOT NULL, "daily_limit" integer NOT NULL DEFAULT '20', "reminder_enabled" boolean NOT NULL DEFAULT true, "reminder_time" character varying NOT NULL DEFAULT '09:00', "timezone" character varying NOT NULL DEFAULT 'UTC', CONSTRAINT "PK_b653a861cf1548ad5a9147f15bd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f2d75df92cec90725baf6dba1f" ON "lingoq"."flashcard_settings" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "lingoq"."flashcard_progress" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" character varying NOT NULL, "vocab_item_id" character varying NOT NULL, "ease_factor" double precision NOT NULL DEFAULT '2.5', "interval" integer NOT NULL DEFAULT '0', "repetitions" integer NOT NULL DEFAULT '0', "next_review_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_reviewed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2d6db376b5526cbeb9b9bbc1448" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_38de8a66b8970b97893a26f78c" ON "lingoq"."flashcard_progress" ("user_id", "vocab_item_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_12c21946891655b94be6b241ec" ON "lingoq"."flashcard_progress" ("user_id", "next_review_at") `);
        await queryRunner.query(`CREATE TABLE "lingoq"."allowed_emails" ("id" character varying(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "email" character varying NOT NULL, "note" character varying, CONSTRAINT "UQ_f29ce963c54fa1dccc83782243f" UNIQUE ("email"), CONSTRAINT "PK_57138c0bae7898d51ec11718c11" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" ADD CONSTRAINT "FK_fc5b58e2d4525fba53a946a383e" FOREIGN KEY ("video_content_id") REFERENCES "lingoq"."video_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_questions" ADD CONSTRAINT "FK_ff4a2b6c5385919e26f4d452708" FOREIGN KEY ("homework_id") REFERENCES "lingoq"."homework"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_answers" ADD CONSTRAINT "FK_9a6d8f81d125db85f2f6d5be461" FOREIGN KEY ("submission_id") REFERENCES "lingoq"."homework_submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."user_onboarding" ADD CONSTRAINT "FK_c604dd5a66a24d79b1ec42f4e57" FOREIGN KEY ("user_id") REFERENCES "lingoq"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" ADD CONSTRAINT "FK_cc362342ca274ef516059737a74" FOREIGN KEY ("user_id") REFERENCES "lingoq"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" ADD CONSTRAINT "FK_6fdfb313bf6af9d4f7084a93ab1" FOREIGN KEY ("video_content_id") REFERENCES "lingoq"."video_content"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_submissions" ADD CONSTRAINT "FK_f53e5ae262ff2280a092dff54bb" FOREIGN KEY ("homework_id") REFERENCES "lingoq"."homework"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_submissions" ADD CONSTRAINT "FK_d11d40978349d11e718258242b9" FOREIGN KEY ("user_session_id") REFERENCES "lingoq"."learning_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" ADD CONSTRAINT "FK_cb341c634d004b3df210b0cf009" FOREIGN KEY ("video_content_id") REFERENCES "lingoq"."video_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" ADD CONSTRAINT "FK_c5221055b51caad24dde1eb8ba9" FOREIGN KEY ("video_content_id") REFERENCES "lingoq"."video_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lingoq"."flashcard_progress" ADD CONSTRAINT "FK_29a3733d0a9963ad1452b5015a2" FOREIGN KEY ("vocab_item_id") REFERENCES "lingoq"."vocab_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lingoq"."flashcard_progress" DROP CONSTRAINT "FK_29a3733d0a9963ad1452b5015a2"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."vocab_items" DROP CONSTRAINT "FK_c5221055b51caad24dde1eb8ba9"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework" DROP CONSTRAINT "FK_cb341c634d004b3df210b0cf009"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_submissions" DROP CONSTRAINT "FK_d11d40978349d11e718258242b9"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_submissions" DROP CONSTRAINT "FK_f53e5ae262ff2280a092dff54bb"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" DROP CONSTRAINT "FK_6fdfb313bf6af9d4f7084a93ab1"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."learning_sessions" DROP CONSTRAINT "FK_cc362342ca274ef516059737a74"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."user_onboarding" DROP CONSTRAINT "FK_c604dd5a66a24d79b1ec42f4e57"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_answers" DROP CONSTRAINT "FK_9a6d8f81d125db85f2f6d5be461"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."homework_questions" DROP CONSTRAINT "FK_ff4a2b6c5385919e26f4d452708"`);
        await queryRunner.query(`ALTER TABLE "lingoq"."session_summaries" DROP CONSTRAINT "FK_fc5b58e2d4525fba53a946a383e"`);
        await queryRunner.query(`DROP TABLE "lingoq"."allowed_emails"`);
        await queryRunner.query(`DROP INDEX "lingoq"."IDX_12c21946891655b94be6b241ec"`);
        await queryRunner.query(`DROP INDEX "lingoq"."IDX_38de8a66b8970b97893a26f78c"`);
        await queryRunner.query(`DROP TABLE "lingoq"."flashcard_progress"`);
        await queryRunner.query(`DROP INDEX "lingoq"."IDX_f2d75df92cec90725baf6dba1f"`);
        await queryRunner.query(`DROP TABLE "lingoq"."flashcard_settings"`);
        await queryRunner.query(`DROP INDEX "lingoq"."IDX_7c48e7329ed12a1c6d30c1b006"`);
        await queryRunner.query(`DROP TABLE "lingoq"."subtitle_cache"`);
        await queryRunner.query(`DROP TABLE "lingoq"."vocab_items"`);
        await queryRunner.query(`DROP TABLE "lingoq"."video_content"`);
        await queryRunner.query(`DROP TABLE "lingoq"."homework"`);
        await queryRunner.query(`DROP TABLE "lingoq"."homework_submissions"`);
        await queryRunner.query(`DROP TABLE "lingoq"."learning_sessions"`);
        await queryRunner.query(`DROP TABLE "lingoq"."users"`);
        await queryRunner.query(`DROP TABLE "lingoq"."user_onboarding"`);
        await queryRunner.query(`DROP TABLE "lingoq"."homework_answers"`);
        await queryRunner.query(`DROP TABLE "lingoq"."homework_questions"`);
        await queryRunner.query(`DROP TABLE "lingoq"."session_summaries"`);
        await queryRunner.query(`DROP TYPE "lingoq"."video_content_job_status_enum"`);
        await queryRunner.query(`DROP TYPE "lingoq"."users_role_enum"`);
        await queryRunner.query(`DROP TYPE "lingoq"."user_onboarding_proficiency_level_enum"`);
        await queryRunner.query(`DROP TYPE "lingoq"."homework_questions_question_type_enum"`);
    }

}
