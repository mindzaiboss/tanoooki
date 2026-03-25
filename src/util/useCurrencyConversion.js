import { useState, useEffect } from 'react';

// Module-level cache shared across all consumers — only fetched once per page load
let _geoCache = null;
let _fxCache = null;

/**
 * Fetches the user's geolocation currency and current FX rates, then converts
 * the given price into the user's local currency.
 *
 * @param {{ amount: number, currency: string } | null} price - Money object (amount in cents)
 * @returns {{ convertedAmount: number, userCurrency: string } | null}
 */
const useCurrencyConversion = price => {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!price?.amount || !price?.currency) return;
    let cancelled = false;

    const run = async () => {
      try {
        if (!_geoCache) {
          const res = await fetch('/api/geolocate');
          if (!res.ok) return;
          _geoCache = await res.json();
        }
        if (!_fxCache) {
          const res = await fetch('/api/fx-rates');
          if (!res.ok) return;
          _fxCache = await res.json();
        }
        if (cancelled) return;

        const userCurrency = _geoCache?.currency;
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
  }, [price?.amount, price?.currency]);

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
