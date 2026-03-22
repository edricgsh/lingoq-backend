import { IsIn, IsInt } from 'class-validator';

export class ReviewFlashcardDto {
  @IsInt()
  @IsIn([0, 1, 2, 3])
  rating: number;
}
