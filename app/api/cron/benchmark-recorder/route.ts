import { ANALYTICS_RECORDER_PAUSED } from '../../../../src/recorder/analyticsSnapshot';
import { authorizeCronRequest } from '../../../../src/recorder/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Benchmark Recorder sweep endpoint — paused.
 *
 * DreamDEX Shannon tops out at a ~2.7h tenor and Binance Dual Investment is a
 * day-scale product, so no ladder row has anything to pair with. Rather than
 * insert empty Runs that would permanently zero the leading-streak aggregation,
 * recording stays off behind a git-tracked flag and Analytics serves the stored
 * samples as a closed observation window (ADR-0013). The vercel.json cron entry
 * is removed to match; this gate stops a stray manual invocation.
 *
 * Recording reopens when day-scale markets exist: flip the flag, restore the
 * cron entry, and reinstate a sweep builder for the live venue.
 */
export async function GET(request: Request) {
  const authorized = authorizeCronRequest({
    authorizationHeader: request.headers.get('authorization'),
    cronSecret: process.env.CRON_SECRET,
  });
  if (!authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (ANALYTICS_RECORDER_PAUSED) {
    return Response.json(
      {
        error:
          'Benchmark Recorder is paused: DreamDEX Shannon has no day-scale shelf to sample against ' +
          'Binance Dual Investment (ADR-0013). Analytics serves the stored observation window.',
      },
      { status: 503 },
    );
  }

  return Response.json(
    { error: 'No sweep builder is wired for the current venue.' },
    { status: 501 },
  );
}
