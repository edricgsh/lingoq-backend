import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from 'src/entities/user.entity';
import { EmailModule } from 'src/modules/email/email.module';
import { SupadataApiKeyModule } from 'src/modules/supadata-api-key/supadata-api-key.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), EmailModule, SupadataApiKeyModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
