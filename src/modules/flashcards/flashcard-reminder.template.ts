export function buildFlashcardReminderEmail(opts: {
  dueCount: number;
  ctaUrl: string;
  settingsUrl: string;
}): { subject: string; html: string } {
  const { dueCount, ctaUrl, settingsUrl } = opts;
  const cardWord = dueCount === 1 ? 'flashcard' : 'flashcards';
  const subject = `${dueCount} ${cardWord} due for review`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#faf5ff;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ff;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(109,40,217,0.08);">

          <!-- Header banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:36px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                Time to review
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 8px;">
              <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
                You have <strong style="color:#7c3aed;">${dueCount} ${cardWord}</strong> ready for review today.
              </p>
              <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
                Consistent reviews are the fastest way to retain what you've learned. It only takes a few minutes.
              </p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 36px;border-radius:50px;letter-spacing:0.2px;">
                      Start review
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                Manage reminders in
                <a href="${settingsUrl}" style="color:#7c3aed;text-decoration:none;">Settings</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return { subject, html };
}
