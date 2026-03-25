// Cache rates for 1 hour to avoid hammering Frankfurter API
let ratesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'JPY', 'CNY', 'KRW', 'THB', 'AUD', 'EUR', 'GBP', 'HKD', 'SGD'];

module.exports = async (req, res) => {
  try {
    const now = Date.now();

    // Return cached rates if still fresh
    if (ratesCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION_MS) {
      return res.json({ success: true, rates: ratesCache, cached: true });
    }

    // Fetch fresh rates from Frankfurter (base USD)
    const currencies = SUPPORTED_CURRENCIES.filter(c => c !== 'USD').join(',');
    const response = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${currencies}`);
    
    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Add USD itself as 1:1
    const rates = { USD: 1, ...data.rates };
    
    // Update cache
    ratesCache = rates;
    cacheTimestamp = now;

    res.json({ success: true, rates, cached: false });
  } catch (error) {
    console.error('FX rates error:', error);
    
    // Return cached rates even if stale on error
    if (ratesCache) {
      return res.json({ success: true, rates: ratesCache, cached: true, stale: true });
    }
    
    res.status(500).json({ error: 'Failed to fetch exchange rates' });
  }
};