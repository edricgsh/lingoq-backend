import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminUserAnalyticsController } from './admin-user-analytics.controller';
import { AdminContentController } from './admin-content.controller';
import { User } from 'src/entities/user.entity';
import { UserOnboarding } from 'src/entities/user-onboarding.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { VideoContent } from 'src/entities/video-content.entity';
import { EmailModule } from 'src/modules/email/email.module';
import { SupadataApiKeyModule } from 'src/modules/supadata-api-key/supadata-api-key.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserOnboarding, LearningSession, VideoContent]),
    EmailModule,
    SupadataApiKeyModule,
  ],
  controllers: [AdminController, AdminUserAnalyticsController, AdminContentController],
  providers: [AdminService],
})
export class AdminModule {}
