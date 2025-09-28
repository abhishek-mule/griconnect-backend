const axios = require('axios');
const logger = require('../utils/logger');

class PriceOracleService {
  constructor() {
    this.supportedCryptos = ['BTC', 'ETH', 'USDT']; // Example supported cryptos
    this.apiBaseUrl = 'https://api.example.com/prices'; // Replace with actual API
  }

  async getAggregatedPrice(cryptoId, currency) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/${cryptoId}/${currency}`);
      return response.data.price;
    } catch (error) {
      logger.error(`Error fetching price for ${cryptoId} in ${currency}:`, error);
      throw error;
    }
  }

  async updatePrices() {
    try {
      for (const cryptoId of this.supportedCryptos) {
        const price = await this.getAggregatedPrice(cryptoId, 'inr');
        console.log(`Updated price for ${cryptoId}:`, price);
      }
    } catch (error) {
      logger.error('Error updating prices:', error);
    }
  }
}

module.exports = new PriceOracleService();