import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateFlashcardSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(50)
  dailyLimit?: number;

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  reminderTime?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
