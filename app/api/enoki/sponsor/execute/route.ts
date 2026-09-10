import {
  executeAppSponsoredTransaction,
  sponsorshipErrorResponse,
  SponsorshipInputError,
} from '../../../../../src/server/enokiSponsor';

export const dynamic = 'force-dynamic';

/** Submits the sender-signed sponsored transaction through Enoki. */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new SponsorshipInputError('Request body must be JSON.');
    });
    const { digest, signature } = (body ?? {}) as Record<string, unknown>;
    return Response.json(await executeAppSponsoredTransaction({ digest, signature }));
  } catch (error) {
    return sponsorshipErrorResponse(error);
  }
}
