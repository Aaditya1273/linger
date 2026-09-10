import {
  createAppSponsoredTransaction,
  isSponsorshipConfigured,
  sponsorshipErrorResponse,
  SponsorshipInputError,
} from '../../../../src/server/enokiSponsor';

export const dynamic = 'force-dynamic';

/** Feature probe: lets the client decide whether sponsored execution exists. */
export async function GET() {
  return Response.json({ enabled: isSponsorshipConfigured() });
}

/** Wraps a gasless transaction kind with Enoki-sponsored gas. */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new SponsorshipInputError('Request body must be JSON.');
    });
    const { transactionKindBytes, sender, recipient } = (body ?? {}) as Record<string, unknown>;
    return Response.json(await createAppSponsoredTransaction({ transactionKindBytes, sender, recipient }));
  } catch (error) {
    return sponsorshipErrorResponse(error);
  }
}
