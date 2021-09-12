import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { uniqBy, flatten, orderBy } from 'lodash';
import { map } from 'p-iteration';
import request from 'request';

import { allowCors } from '../../utils/allow-cors';

const TOKENS_LIST = [
  'https://yearn.science/static/tokenlist.json',
  'https://gateway.ipfs.io/ipns/tokens.uniswap.org',
  'https://unpkg.com/@sushiswap/default-token-list/build/sushiswap-default.tokenlist.json',
  'https://unpkg.com/@cometh-game/default-token-list/build/comethswap-default.tokenlist.json',
  'https://raw.githubusercontent.com/compound-finance/token-list/master/compound.tokenlist.json',
  'https://unpkg.com/default-token-list@2.27.3/build/tokens.json',
  'https://unpkg.com/quickswap-default-token-list/build/quickswap-default.tokenlist.json',
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
  dQUICK: 'QUICK',
};

const customImages: Record<string, string> = {
  r4Belt: 'https://s.belt.fi/info/R4BELT@2x.png',
  LAUNCH: 'https://superlauncher.io/img/coin/launch.svg',
  MRF: 'https://superlauncher.io/img/project/mrf/mrf-logo.svg',
  CIFI: 'https://superlauncher.io/img/project/cifi/cifi-logo.svg',
  BYG: 'https://superlauncher.io/img/project/black-eye-galaxy-logo.png',
  C98: 'https://assets.trustwalletapp.com/blockchains/smartchain/assets/0xaEC945e04baF28b135Fa7c640f624f8D90F1C3a6/logo.png',
  QUICK:
    'https://raw.githubusercontent.com/trustwallet/assets/6572a691df8141f3e8213cb97ef8d2e4b86d8b86/blockchains/ethereum/assets/0x6c28AeF8977c9B773996d0e8376d2EE379446F2f/logo.png',
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
  const tokens = await map(TOKENS_LIST, async (url) => {
    const { data } = await axios.get<{ tokens: Token[] }>(url);
    return Array.isArray(data?.tokens)
      ? orderBy(
          data.tokens.filter(
            (t) => t.chainId === 137 || t.chainId === 1 || t.chainId === 56
          ),
          ['chainId'],
          ['asc']
        )
      : [];
  });
  return uniqBy(
    flatten(tokens),
    (token) => `${token.chainId}-${token.address}`
  );
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
  if (customImages[tokenSymbol]) {
    return { logoURI: customImages[tokenSymbol] };
  }

  const {
    data: { tokens: ethTokens },
  } = await axios.get<{ tokens: TrustWalletAsset[] }>(ethTokensJson);

  const ethMatch = ethTokens.find((t) => t.symbol === tokenSymbol);

  if (ethMatch) {
    return ethMatch;
  }

  const {
    data: { tokens: bscTokens },
  } = await axios.get<{ tokens: TrustWalletAsset[] }>(bscTokensJson);

  const bscMatch = bscTokens.find((t) => t.symbol === tokenSymbol);

  if (bscMatch) {
    return bscMatch;
  }

  const listMatch = await searchTokenInLists(tokenSymbol);

  if (listMatch) {
    return listMatch;
  }

  return null;
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<any> {
  // cache response one year
  res.setHeader('Cache-Control', 's-maxage=360000, stale-while-revalidate');

  const tokenSymbolQuery = req.query.token as string;
  const tokenSymbol = tokenRewrites[tokenSymbolQuery] || tokenSymbolQuery;
  const token = await searchToken(tokenSymbol);

  if (token) {
    return request.get(token.logoURI).pipe(res);
  }

  return request
    .get(`https://farm.army/token/${tokenSymbol.toLowerCase()}.webp`)
    .pipe(res);
}

export default allowCors(handler);
