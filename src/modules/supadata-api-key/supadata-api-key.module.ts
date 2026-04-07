import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupadataApiKey } from 'src/entities/supadata-api-key.entity';
import { SupadataApiKeyService } from './supadata-api-key.service';

@Module({
  imports: [TypeOrmModule.forFeature([SupadataApiKey])],
  providers: [SupadataApiKeyService],
  exports: [SupadataApiKeyService],
})
export class SupadataApiKeyModule {}
