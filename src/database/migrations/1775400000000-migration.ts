import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775400000000 implements MigrationInterface {
    name = 'Migration1775400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "lingoq"."supadata_api_keys" (
                "id" character varying(36) NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "email" character varying(255) NOT NULL,
                "api_key" character varying(1024) NOT NULL,
                "status" character varying(32) NOT NULL DEFAULT 'AVAILABLE',
                "is_active" boolean NOT NULL DEFAULT true,
                "next_active_time" TIMESTAMP WITH TIME ZONE,
                "max_credits" integer,
                "used_credits" integer,
                "next_credit_fetch" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_supadata_api_keys" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "lingoq"."supadata_api_keys"`);
    }
}
