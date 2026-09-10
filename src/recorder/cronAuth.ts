/**
 * Authorize a Vercel Cron (or manual) trigger.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
 */
export function authorizeCronRequest(input: {
  authorizationHeader: string | null;
  cronSecret: string | undefined;
}): boolean {
  const secret = input.cronSecret?.trim();
  if (!secret) return false;
  const header = input.authorizationHeader?.trim();
  if (!header) return false;
  return header === `Bearer ${secret}`;
}
