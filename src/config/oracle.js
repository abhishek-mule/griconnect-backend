const { ethers } = require('ethers');
const axios = require('axios');
const logger = require('../utils/logger');

// Oracle configuration
const ORACLE_CONFIG = {
  // Chainlink price feed addresses (Polygon mainnet)
  CHAINLINK_PRICE_FEEDS: {
    'MATIC/USD': process.env.CHAINLINK_MATIC_USD || '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
    'ETH/USD': process.env.CHAINLINK_ETH_USD || '0xF9680D99D6C9589e2a93a78A04A279e509205945',
    'BTC/USD': process.env.CHAINLINK_BTC_USD || '0xc907E116054Ad103354f2D350FD2514433D57F6f',
  },
  
  // External API endpoints
  API_ENDPOINTS: {
    COINGECKO: 'https://api.coingecko.com/api/v3',
    COINMARKETCAP: 'https://pro-api.coinmarketcap.com/v1',
    CHAINLINK: 'https://data.chain.link/polygon/mainnet'
  },
  
  // Cache settings (in milliseconds)
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  
  // Rate limiting
  RATE_LIMIT: {
    maxRequests: 50, // Max requests per minute
    perMinute: 60 * 1000 // 1 minute
  }
};

// In-memory price cache
const priceCache = new Map();

// Get price from cache if available and not expired
const getCachedPrice = (pair) => {
  const cached = priceCache.get(pair);
  if (cached && (Date.now() - cached.timestamp) < ORACLE_CONFIG.CACHE_TTL) {
    return cached.price;
  }
  return null;
};

// Update price in cache
const updateCachedPrice = (pair, price) => {
  priceCache.set(pair, {
    price,
    timestamp: Date.now()
  });
};

// Get price from Chainlink price feed
const getChainlinkPrice = async (pair) => {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const priceFeedAddress = ORACLE_CONFIG.CHAINLINK_PRICE_FEEDS[pair];
    
    if (!priceFeedAddress) {
      throw new Error(`No Chainlink price feed configured for ${pair}`);
    }
    
    const priceFeedABI = [
      'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)'
    ];
    
    const priceFeed = new ethers.Contract(priceFeedAddress, priceFeedABI, provider);
    const roundData = await priceFeed.latestRoundData();
    const price = parseFloat(ethers.formatUnits(roundData.answer, 8)); // Chainlink uses 8 decimals for USD pairs
    
    updateCachedPrice(pair, price);
    return price;
  } catch (error) {
    logger.error(`Chainlink price fetch failed for ${pair}:`, error);
    throw new Error(`Failed to fetch price from Chainlink: ${error.message}`);
  }
};

// Get price from CoinGecko API
const getCoinGeckoPrice = async (pair) => {
  try {
    const [from, to] = pair.split('/');
    const response = await axios.get(
      `${ORACLE_CONFIG.API_ENDPOINTS.COINGECKO}/simple/price?ids=${from.toLowerCase()}&vs_currencies=${to.toLowerCase()}`
    );
    
    const price = response.data[from.toLowerCase()]?.[to.toLowerCase()];
    if (!price) {
      throw new Error(`Invalid response from CoinGecko: ${JSON.stringify(response.data)}`);
    }
    
    updateCachedPrice(pair, price);
    return price;
  } catch (error) {
    logger.error(`CoinGecko price fetch failed for ${pair}:`, error);
    throw new Error(`Failed to fetch price from CoinGecko: ${error.message}`);
  }
};

// Get price from CoinMarketCap API
const getCoinMarketCapPrice = async (pair) => {
  try {
    const [from, to] = pair.split('/');
    const response = await axios.get(
      `${ORACLE_CONFIG.API_ENDPOINTS.COINMARKETCAP}/cryptocurrency/quotes/latest?symbol=${from}&convert=${to}`,
      {
        headers: {
          'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY
        }
      }
    );
    
    const data = response.data?.data?.[from.toUpperCase()]?.quote?.[to.toUpperCase()];
    if (!data?.price) {
      throw new Error(`Invalid response from CoinMarketCap: ${JSON.stringify(response.data)}`);
    }
    
    const price = parseFloat(data.price);
    updateCachedPrice(pair, price);
    return price;
  } catch (error) {
    logger.error(`CoinMarketCap price fetch failed for ${pair}:`, error);
    throw new Error(`Failed to fetch price from CoinMarketCap: ${error.message}`);
  }
};

// Get price from the best available source
const getPrice = async (pair, source = 'auto') => {
  // Check cache first
  const cachedPrice = getCachedPrice(pair);
  if (cachedPrice !== null) {
    return cachedPrice;
  }
  
  try {
    // Try Chainlink first if available
    if (ORACLE_CONFIG.CHAINLINK_PRICE_FEEDS[pair] && (source === 'auto' || source === 'chainlink')) {
      return await getChainlinkPrice(pair);
    }
    
    // Fall back to CoinGecko
    if (source === 'auto' || source === 'coingecko') {
      return await getCoinGeckoPrice(pair);
    }
    
    // Try CoinMarketCap if API key is available
    if (process.env.COINMARKETCAP_API_KEY && (source === 'auto' || source === 'coinmarketcap')) {
      return await getCoinMarketCapPrice(pair);
    }
    
    throw new Error('No suitable price oracle available');
  } catch (error) {
    logger.error(`Price fetch failed for ${pair} from ${source}:`, error);
    
    // If auto mode, try fallback sources
    if (source === 'auto') {
      if (error.message.includes('Chainlink')) {
        logger.info('Falling back to CoinGecko...');
        return getPrice(pair, 'coingecko');
      }
    }
    
    throw new Error(`Failed to fetch price: ${error.message}`);
  }
};

// Get exchange rate between two assets
const getExchangeRate = async (from, to, source = 'auto') => {
  if (from === to) return 1;
  
  try {
    // Try direct pair first
    const directPair = `${from}/${to}`;
    if (ORACLE_CONFIG.CHAINLINK_PRICE_FEEDS[directPair] || 
        (from.toLowerCase() === 'matic' && to.toLowerCase() === 'usd')) {
      return await getPrice(directPair, source);
    }
    
    // Try through USD pairs
    const fromPrice = await getPrice(`${from}/USD`, source);
    const toPrice = await getPrice(`${to}/USD`, source);
    
    if (!fromPrice || !toPrice) {
      throw new Error('Could not determine exchange rate through USD pairs');
    }
    
    return fromPrice / toPrice;
  } catch (error) {
    logger.error(`Exchange rate fetch failed from ${from} to ${to}:`, error);
    throw new Error(`Failed to get exchange rate: ${error.message}`);
  }
};

// Update all prices in the cache
const updateAllPrices = async () => {
  const pairs = Object.keys(ORACLE_CONFIG.CHAINLINK_PRICE_FEEDS);
  const results = {};
  
  for (const pair of pairs) {
    try {
      const price = await getPrice(pair);
      results[pair] = { price, success: true };
    } catch (error) {
      results[pair] = { error: error.message, success: false };
    }
  }
  
  return results;
};

module.exports = {
  ORACLE_CONFIG,
  getPrice,
  getExchangeRate,
  updateAllPrices,
  getCachedPrice
};
