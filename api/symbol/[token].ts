import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { uniqBy, flatten } from 'lodash';
import { map } from 'p-iteration';
import request from 'request';

import { allowCors } from '../../utils/allow-cors';

const POLYGON_TOKENS_LISTS = [
  'https://unpkg.com/@sushiswap/default-token-list/build/sushiswap-default.tokenlist.json',
  'https://unpkg.com/quickswap-default-token-list/build/quickswap-default.tokenlist.json',
  'https://unpkg.com/@cometh-game/default-token-list/build/comethswap-default.tokenlist.json',
];

const bscTokensJson =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/tokenlist.json';

const ethTokensJson =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/tokenlist.json';

const tokenRewrites: Record<string, string> = {
  beltBTC: 'BTC',
  BTC: 'btcb',
  BNB: 'wbnb',
  pAUTO: 'AUTO',
  QUICK: 'Quick',
};

const customImages: Record<string, string> = {
  r4Belt: 'https://s.belt.fi/info/R4BELT@2x.png',
  LAUNCH: 'https://superlauncher.io/img/coin/launch.svg',
  MRF: 'https://superlauncher.io/img/project/mrf/mrf-logo.svg',
  CIFI: 'https://superlauncher.io/img/project/cifi/cifi-logo.svg',
  BYG: 'https://superlauncher.io/img/project/black-eye-galaxy-logo.png',
  C98: 'https://assets.trustwalletapp.com/blockchains/smartchain/assets/0xaEC945e04baF28b135Fa7c640f624f8D90F1C3a6/logo.png',
};

interface Token {
  name: string;
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
  logoURI: string;
}

interface TrustWalletAsset {
  asset: string;
  type: string;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}

async function fetchTokensLists(): Promise<Token[]> {
  const tokens = await map(POLYGON_TOKENS_LISTS, async (url) => {
    const { data } = await axios.get<{ tokens: Token[] }>(url);
    return Array.isArray(data?.tokens)
      ? data.tokens.filter((t) => t.chainId === 137)
      : [];
  });
  return uniqBy(flatten(tokens), 'address');
}

async function searchTokenInLists(
  tokenSymbol: string
): Promise<Token | undefined> {
  const tokens = await fetchTokensLists();
  return tokens.find((t) => t.symbol === tokenSymbol);
}

async function searchToken(
  tokenSymbol: string
): Promise<{ logoURI: string } | null> {
  const _tokenSymbol = tokenRewrites[tokenSymbol] || tokenSymbol;

  if (customImages[_tokenSymbol]) {
    return { logoURI: customImages[_tokenSymbol] };
  }

  const listMatch = await searchTokenInLists(_tokenSymbol);

  if (listMatch) {
    return listMatch;
  }

  const {
    data: { tokens: bscTokens },
  } = await axios.get<{ tokens: TrustWalletAsset[] }>(bscTokensJson);

  const bscMatch = bscTokens.find(
    (t) =>
      t.symbol === _tokenSymbol ||
      t.symbol.toLowerCase() === _tokenSymbol.toLowerCase()
  );

  if (bscMatch) {
    return bscMatch;
  }

  const {
    data: { tokens: ethTokens },
  } = await axios.get<{ tokens: TrustWalletAsset[] }>(ethTokensJson);

  const ethMatch = ethTokens.find(
    (t) =>
      t.symbol === _tokenSymbol ||
      t.symbol.toLowerCase() === _tokenSymbol.toLowerCase()
  );

  if (ethMatch) {
    return ethMatch;
  }

  return null;
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<any> {
  // cache response one year
  res.setHeader('Cache-Control', 's-maxage=360000, stale-while-revalidate');

  const tokenSymbol = req.query.token as string;
  const token = await searchToken(tokenSymbol);

  if (token) {
    return request.get(token.logoURI).pipe(res);
  }

  return request
    .get(`https://farm.army/token/${tokenSymbol.toLowerCase()}.webp`)
    .pipe(res);
}

export default allowCors(handler);
