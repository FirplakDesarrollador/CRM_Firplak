/** Mercado de una cuenta o prospecto: Internacional o, si no, Nacional (como `market_of` en la base). */
export const marketOf = (market?: string | null) => (market === "Internacional" ? "Internacional" : "Nacional");

/**
 * El pipeline del mercado y el canal de una cuenta (como `channel_pipeline` en la base). Sin él, la base no deja
 * crear la oportunidad hasta que administración lo cree.
 */
export function pipelineFor<T extends { channel: string | null; market: string; is_active: boolean }>(
  pipelines: T[], market: string | null | undefined, channel: string | null | undefined,
): T | undefined {
  if (!channel) return undefined;
  return pipelines.find((p) => p.is_active && p.channel === channel && p.market === marketOf(market));
}
