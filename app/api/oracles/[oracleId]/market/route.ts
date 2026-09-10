import { fetchOracleMarketServer } from '../../../../../src/deepbook/predictServer';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { oracleId: string } },
) {
  const oracleId = params.oracleId;
  if (!oracleId || !/^0x[0-9a-fA-F]+$/.test(oracleId)) {
    return Response.json({ error: 'Invalid oracle id.' }, { status: 400 });
  }

  const lag = Number(new URL(request.url).searchParams.get('lag') ?? 0);
  try {
    const market = await fetchOracleMarketServer(oracleId, {
      serverLagSeconds: Number.isFinite(lag) ? lag : 0,
    });
    return Response.json(market, {
      headers: { 'cache-control': 's-maxage=5, stale-while-revalidate=15' },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Oracle market fetch failed.' },
      { status: 502 },
    );
  }
}
