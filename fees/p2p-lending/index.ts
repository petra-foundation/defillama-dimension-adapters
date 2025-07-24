import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { FetchOptions, FetchResult } from "../../adapters/types";

const headers: HeadersInit = {
  origin: "https://subgraph.smardex.io",
  referer: "https://subgraph.smardex.io",
  "x-api-key": process.env.SMARDEX_SUBGRAPH_API_KEY || "",
};

type DailyTokenMetric = {
  id: string;
  totalInterestPaid: string;
};

const sdexAddress = "0x5de8ab7e27f6e7a1fff3e5b337584aa43961beef";
const ethereumSubgraphUrl = "https://subgraph.smardex.io/ethereum/spro";
const arbitrumSubgraphUrl = "https://subgraph.smardex.io/arbitrum/spro";
const bscSubgraphUrl = "https://subgraph.smardex.io/bsc/spro";
const baseSubgraphUrl = "https://subgraph.smardex.io/base/spro";
const polygonSubgraphUrl = "https://subgraph.smardex.io/polygon/spro";


const getSubgraphUrl = (chain: string): string => {
  switch (chain) {
    case CHAIN.ETHEREUM:
      return ethereumSubgraphUrl;
    case CHAIN.ARBITRUM:
      return arbitrumSubgraphUrl;
    case CHAIN.BSC:
      return bscSubgraphUrl;
    case CHAIN.BASE:
      return baseSubgraphUrl;
    case CHAIN.POLYGON:
      return polygonSubgraphUrl;
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
};

const getDailyTokenMetrics = async (timestamp: number, chain: string): Promise<DailyTokenMetric[]> => {
  const dailyTokenMetricsQuery = `
      {
        dailyTokenMetrics_collection (where: {
          day: "${timestamp}"
        }) {
          id
          totalInterestPaid
        }
      }`;

  const url = getSubgraphUrl(chain);
  const result = await request(url, dailyTokenMetricsQuery, {}, headers);
  return result.dailyTokenMetrics_collection || [];
};

/*
 * Fetch the metrics from the subgraph for a given timestamp.
 * @param timestamp - The timestamp to fetch fees for.
 * @returns An object containing the total SDEX burnt and daily token metrics.
 */

const getMetricsFromSubgraph = async (timestamp: number, chain: string) => {
  try {
    const dailyGlobalMetricsQuery = `{
      dailyGlobalMetrics_collection (where: {
        id: "${timestamp}"
      }) {
        totalSdexBurnt
      }
    }`;

    const url = getSubgraphUrl(chain);
    const dailyGlobalMetrics = (await request(url, dailyGlobalMetricsQuery, {}, headers))
      .dailyGlobalMetrics_collection[0];

    const dailyTokenMetrics = await getDailyTokenMetrics(timestamp, chain);

    return {
      totalSdexBurnt: dailyGlobalMetrics?.totalSdexBurnt || 0,
      dailyTokenMetrics: dailyTokenMetrics.map((token) => ({
        // Token id is in format <timestamp>-<tokenId>
        id: token.id.split("-")[1],
        totalInterestPaid: parseFloat(token.totalInterestPaid),
      })),
    };
  } catch (error) {
    return {
      totalSdexBurnt: 0,
      dailyTokenMetrics: [],
    };
  }
};


const fetch = (chain: string) => async (_: number, _t: any, { startOfDay, createBalances }: FetchOptions): Promise<FetchResult> => {
  const timestamp = startOfDay;
  const metrics = await getMetricsFromSubgraph(timestamp, chain);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  dailyFees.addToken(sdexAddress, metrics.totalSdexBurnt);
  metrics.dailyTokenMetrics.forEach((token) => {
    dailyFees.addToken(token.id, token.totalInterestPaid);
  });

  dailyRevenue.addToken(sdexAddress, metrics.totalSdexBurnt);

  return {
    dailyFees,
    dailyRevenue,
  };
};


const methodology = {
  Fees: "Protocol fees are given by interests paid in credit Tokens by Borrowers to Lenders, cumulated with the amount of SDEX burned at Proposal creation.",
  Revenue: "Protocol revenue is the total amount of SDEX burned at each new Proposal creation.",
};

const startDate = "2025-05-22";

const adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: startDate,
      meta: { methodology },
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: startDate,
      meta: { methodology },
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: startDate,
      meta: { methodology },
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: startDate,
      meta: { methodology },
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: startDate,
      meta: { methodology },
    },
  },
  version: 1,
};

export default adapter;
