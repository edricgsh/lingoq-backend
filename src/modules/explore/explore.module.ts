import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExploreTopicQuery } from 'src/entities/explore-topic-query.entity';
import { ExploreRecommendation } from 'src/entities/explore-recommendation.entity';
import { SubtitleCache } from 'src/entities/subtitle-cache.entity';
import { OnboardingModule } from 'src/modules/onboarding/onboarding.module';
import { ExploreService } from './explore.service';
import { ExploreWorker } from './explore.worker';
import { ExploreController } from './explore.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExploreTopicQuery, ExploreRecommendation, SubtitleCache]),
    OnboardingModule,
  ],
  providers: [ExploreService, ExploreWorker],
  controllers: [ExploreController],
})
export class ExploreModule {}
