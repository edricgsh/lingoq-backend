import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { DataSource } from 'typeorm';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { withRetry } from './connection-retry.util';

const DB_SCHEMA = 'lingoq';
const logger = new Logger('MigrationRunner');

function getSslConfig(): { rejectUnauthorized: boolean; ca: string } | undefined {
  const sslCertRelPath = process.env.DB_SSL_CERT;
  if (!sslCertRelPath) return undefined;
  return {
    rejectUnauthorized: true,
    ca: fs.readFileSync(path.resolve(process.cwd(), sslCertRelPath)).toString(),
  };
}

async function getDatabaseConfig(secretsService: AwsSecretsService) {
  const secrets = await secretsService.getSecret();
  const ssl = getSslConfig();
  return {
    type: 'postgres' as const,
    host: secrets.DB_HOST || 'localhost',
    port: parseInt(secrets.DB_PORT || '5433'),
    username: secrets.DB_USERNAME || 'postgres',
    password: secrets.DB_PASSWORD || 'postgres',
    database: secrets.DB_NAME || 'postgres',
    schema: DB_SCHEMA,
    ...(ssl && { ssl }),
    extra: {
      options: `-c search_path=${DB_SCHEMA}`,
    },
    entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
    migrations: [process.cwd() + '/dist/database/migrations/*.js'],
    synchronize: false,
    logging: false,
  };
}

async function runMigrations() {
  try {
    logger.log('Starting database migration process...');

    const envPath = `.env.${process.env.NODE_ENV || 'local'}`;
    let config: ReturnType<typeof dotenv.config>;

    if (existsSync(envPath)) {
      config = dotenv.config({ path: envPath });
      logger.log(`Loaded environment from: ${envPath}`);
    } else {
      logger.warn(
        `Env file not found at path: ${envPath}, using existing environment variables`,
      );
      config = { parsed: process.env };
    }

    const appConfigService = new ConfigService(config);
    const appSecretsService = new AwsSecretsService(appConfigService);

    const databaseConfig = await withRetry(
      async () => {
        logger.log('Retrieving database configuration...');
        return await getDatabaseConfig(appSecretsService);
      },
      {
        maxAttempts: 5,
        initialDelayMs: 2000,
        maxDelayMs: 10000,
      },
      logger,
    );

    // Create schema using a plain connection before initializing the main DataSource,
    // because TypeORM needs the schema to exist before it can create the migrations table.
    logger.log(`Ensuring schema "${DB_SCHEMA}" exists...`);
    const bootstrapDs = new DataSource({
      type: 'postgres',
      host: databaseConfig.host,
      port: databaseConfig.port,
      username: databaseConfig.username,
      password: databaseConfig.password,
      database: databaseConfig.database,
      ...(databaseConfig.ssl && { ssl: databaseConfig.ssl }),
    });
    await bootstrapDs.initialize();
    await bootstrapDs.query(`CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}"`);
    await bootstrapDs.destroy();

    logger.log('Creating DataSource...');
    const dataSource = new DataSource(databaseConfig);

    await withRetry(
      async () => {
        logger.log('Initializing database connection...');

        if (!dataSource.isInitialized) {
          await dataSource.initialize();
          logger.log('Database connection initialized successfully');
        }

        logger.log('Running pending migrations...');
        const migrations = await dataSource.runMigrations();

        if (migrations.length === 0) {
          logger.log('No pending migrations to run');
        } else {
          logger.log(`Successfully ran ${migrations.length} migration(s):`);
          migrations.forEach((migration) => {
            logger.log(`  - ${migration.name}`);
          });
        }
      },
      {
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
      },
      logger,
    );

    if (dataSource.isInitialized) {
      await dataSource.destroy();
      logger.log('Database connection closed');
    }

    logger.log('Migration process completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

void runMigrations();
