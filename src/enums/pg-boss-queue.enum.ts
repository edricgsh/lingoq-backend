export enum PgBossQueueEnum {
  PROCESS_YOUTUBE_URL = 'process-youtube-url',
  REGENERATE_CONTENT = 'regenerate-content',
  REGENERATE_CONTENT_DEAD_LETTER = 'regenerate-content-dead-letter',
  SCHEDULE_FLASHCARD_REMINDERS = 'schedule-flashcard-reminders',
  SEND_FLASHCARD_REMINDER = 'send-flashcard-reminder',
  EXPLORE_GENERATE_RECOMMENDATIONS = 'explore-generate-recommendations',
}
