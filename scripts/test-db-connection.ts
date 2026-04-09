import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import { ConfigService } from '@nestjs/config';
import { AwsSecretsService } from '../src/modules/aws-secrets/aws-secrets.service';

const envPath = `.env.${process.env.NODE_ENV || 'local'}`;
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`Loaded env: ${envPath}`);
}

async function testConnection() {
  const configService = new ConfigService(process.env);
  const secretsService = new AwsSecretsService(configService);
  const secrets = await secretsService.getSecret();

  const host = secrets.DB_HOST;
  const port = parseInt(secrets.DB_PORT || '5432');
  const user = secrets.DB_USERNAME;
  const database = secrets.DB_NAME;

  const sslCertRelPath = process.env.DB_SSL_CERT;
  const ssl = sslCertRelPath
    ? { rejectUnauthorized: true, ca: fs.readFileSync(path.resolve(process.cwd(), sslCertRelPath)).toString() }
    : undefined;

  console.log(`Connecting to: ${user}@${host}:${port}/${database}`);
  console.log(`SSL: ${ssl ? `enabled (cert: ${sslCertRelPath})` : 'disabled'}`);

  const client = new Client({ host, port, user, password: secrets.DB_PASSWORD, database, ssl });

  try {
    await client.connect();
    const result = await client.query('SELECT current_database(), current_user, version()');
    const row = result.rows[0];
    console.log('');
    console.log('Connection successful!');
    console.log(`  Database : ${row.current_database}`);
    console.log(`  User     : ${row.current_user}`);
    console.log(`  Version  : ${row.version.split(' ').slice(0, 2).join(' ')}`);
    await client.end();
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
}

testConnection();
