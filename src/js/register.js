// REGISTER — every external fact lives in exactly one record.
// state: "stated" | "absent" | "unconfirmed". Absent / unconfirmed records render inert.
// Edit a record here (or pass --ca/--x/--github to the build); nothing else in the project holds these facts.
export const REGISTER = {
  project: { state: 'stated', name: 'Novar', domain: 'Novar.cloud' },
  chain: { state: 'stated', name: 'Solana mainnet', rpc: 'https://solana-rpc.publicnode.com' },
  ca: { state: 'absent', value: null },
  x: { state: 'absent', url: null },
  github: { state: 'absent', url: null },
  // market-source record: the live board follows this record only. CA state has zero effect on it.
  market: {
    state: 'stated',
    boosts: 'https://api.dexscreener.com/token-boosts/top/v1',
    tokens: 'https://api.dexscreener.com/tokens/v1/solana/',
    ownDex: 'https://api.dexscreener.com/latest/dex/tokens/',
    ownPump: 'https://frontend-api.pump.fun/coins/',
  },
};
