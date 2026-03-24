import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { DataSource } from 'typeorm';

const DB_SCHEMA = 'lingoq';
const MIGRATIONS_GLOB = [__dirname + '/migrations/*.js'];

// Used by TypeORM CLI for migration:generate and migration:revert
async function initializeAppDataSource() {
  if (process.env.DB_MIGRATION === 'true') {
    const envPath = `.env.${process.env.NODE_ENV || 'local'}`;
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath });
    } else {
      dotenv.config();
    }

    const { ConfigService } = await import('@nestjs/config');
    const { AwsSecretsService } = await import(
      '../modules/aws-secrets/aws-secrets.service'
    );

    const configService = new ConfigService(process.env);
    const secretsService = new AwsSecretsService(configService);
    const secrets = await secretsService.getSecret();

    return new DataSource({
      type: 'postgres',
      host: secrets.DB_HOST || 'localhost',
      port: parseInt(secrets.DB_PORT || '5433'),
      username: secrets.DB_USERNAME || 'postgres',
      password: secrets.DB_PASSWORD || 'postgres',
      database: secrets.DB_NAME || 'postgres',
      schema: DB_SCHEMA,
      extra: {
        options: `-c search_path=${DB_SCHEMA}`,
      },
      entities: [__dirname + '/../entities/*.entity.js'],
      migrations: MIGRATIONS_GLOB,
      synchronize: false,
      logging: true,
    });
  }
}

export const AppDataSource = initializeAppDataSource();
