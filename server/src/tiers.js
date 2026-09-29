export const TIERS = [
  {
    id: 1,
    name: 'Basic',
    tag: 'Welcome Tier',
    rate: '1.00%',
    multiplier: 1,
    tone: 'basic',
    offer: 'Includes a one-time training credit of £300 / €300',
    cta: 'Get Started',
  },
  {
    id: 2,
    name: 'Bronze',
    tag: 'Entry Tier',
    rate: '1.00%',
    multiplier: 1,
    tone: 'bronze',
    offer: 'Unlock with £50 / €50',
    cta: 'Activate Now',
  },
  {
    id: 3,
    name: 'Gold',
    tag: 'Growth Tier',
    rate: '1.40%',
    multiplier: 1.4,
    tone: 'gold',
    offer: 'Unlock with £300 / €300',
    cta: 'Upgrade',
  },
  {
    id: 4,
    name: 'Platinum',
    tag: 'Elite Tier',
    rate: '1.80%',
    multiplier: 1.8,
    tone: 'platinum',
    offer: 'Unlock with £8,000 / €8,000',
    note: 'Eligible for upgrade after 14 days',
    cta: 'Upgrade',
  },
];

export const DEFAULT_TIER = 2;

export const TIER_NAMES = Object.fromEntries(TIERS.map((t) => [t.id, t.name]));
export const TIER_MULT = Object.fromEntries(TIERS.map((t) => [t.id, t.multiplier]));

export function clampTier(tier) {
  const t = Number(tier);
  if (!Number.isInteger(t) || t < 1 || t > 4) return DEFAULT_TIER;
  return t;
}

export function tierInfo(tier) {
  const t = clampTier(tier);
  const row = TIERS.find((x) => x.id === t);
  return {
    tier: t,
    tier_name: row.name,
    tier_tag: row.tag,
    commission_rate: row.rate,
    multiplier: row.multiplier,
  };
}

export function applyTierPay(payDollars, tier) {
  const { multiplier } = tierInfo(tier);
  return Number((Number(payDollars || 0) * multiplier).toFixed(2));
}

export const WITHDRAW_METHODS = ['demo', 'usdt_trc20', 'usdt_erc20', 'usdt_bep20', 'btc', 'bank', 'wise'];
export const DEPOSIT_METHODS = ['demo', 'wise', 'instant', 'crypto', 'bank', 'transfer', 'usdt_trc20', 'usdt_erc20', 'usdt_bep20', 'btc'];

export function methodToCrypto(method) {
  return {
    usdt_trc20: { cryptocurrency: 'USDT', network: 'TRC20' },
    usdt_erc20: { cryptocurrency: 'USDT', network: 'ERC20' },
    usdt_bep20: { cryptocurrency: 'USDT', network: 'BEP20' },
    btc: { cryptocurrency: 'BTC', network: 'BTC' },
  }[method] || null;
}
