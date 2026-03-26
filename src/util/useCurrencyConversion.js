import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';

// Mirrors the map in server/api/geolocate.js — keep in sync if that map changes
const COUNTRY_CURRENCY_MAP = {
  US: 'USD',
  CA: 'CAD',
  JP: 'JPY',
  CN: 'CNY',
  KR: 'KRW',
  TH: 'THB',
  AU: 'AUD',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', IE: 'EUR',
  GR: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR',
  LT: 'EUR', LU: 'EUR', MT: 'EUR', CY: 'EUR',
  GB: 'GBP',
  HK: 'HKD',
  SG: 'SGD',
};

// Module-level cache — only fetched once per page load
let _geoCache = null;
let _fxCache = null;

/**
 * Fetches the user's currency (from their profile country first, then geolocate)
 * and current FX rates, then converts the given price into the user's local currency.
 *
 * @param {{ amount: number, currency: string } | null} price - Money object (amount in cents)
 * @returns {{ convertedAmount: number, userCurrency: string } | null}
 */
const useCurrencyConversion = price => {
  const [result, setResult] = useState(null);

  const currentUser = useSelector(state => state.user.currentUser);
  const profileCountry = currentUser?.attributes?.profile?.privateData?.country;
  const profileCurrency = profileCountry ? COUNTRY_CURRENCY_MAP[profileCountry] : null;

  useEffect(() => {
    if (!price?.amount || !price?.currency) return;
    let cancelled = false;

    const fetchWithTimeout = (url, ms = 3000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    };

    const run = async () => {
      try {
        // Fetch geo only when the profile doesn't supply a country
        const needsGeo = !profileCurrency && !_geoCache;
        const [geoRes, fxRes] = await Promise.all([
          needsGeo ? fetchWithTimeout('/api/geolocate') : Promise.resolve(null),
          _fxCache   ? Promise.resolve(null)            : fetchWithTimeout('/api/fx-rates'),
        ]);

        if (geoRes) {
          if (!geoRes.ok) return;
          _geoCache = await geoRes.json();
        }
        if (fxRes) {
          if (!fxRes.ok) return;
          _fxCache = await fxRes.json();
        }
        if (cancelled) return;

        const userCurrency = profileCurrency || _geoCache?.currency;
        if (!userCurrency || userCurrency === price.currency) return;

        const rates = _fxCache?.rates;
        if (!rates?.[userCurrency]) return;

        const amountInMajor = price.amount / 100;
        let convertedAmount;
        if (price.currency === 'USD') {
          convertedAmount = amountInMajor * rates[userCurrency];
        } else if (rates[price.currency]) {
          convertedAmount = (amountInMajor / rates[price.currency]) * rates[userCurrency];
        } else {
          return;
        }

        setResult({ convertedAmount, userCurrency });
      } catch (_) {
        // silently ignore — this is a convenience hint only
      }
    };

    run();
    return () => { cancelled = true; };
  }, [price?.amount, price?.currency, profileCurrency]);

  return result;
};

/**
 * Formats a converted amount using the narrow currency symbol (e.g. "$" for CAD)
 * followed by the ISO currency code as a suffix.
 * Example: formatConvertedAmount(13.78, 'CAD') → '$13.78'
 */
export const formatConvertedAmount = (amount, currency) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

export default useCurrencyConversion;
