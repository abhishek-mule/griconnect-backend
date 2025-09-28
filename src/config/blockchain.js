const { ethers } = require('ethers');
const logger = require('../utils/logger');

// Initialize providers for different networks
const providers = {
  polygon: new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'),
  mumbai: new ethers.JsonRpcProvider(process.env.POLYGON_TESTNET_RPC_URL || 'https://polygon-mumbai.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY'),
  local: new ethers.JsonRpcProvider('http://127.0.0.1:8545')
};

// Get provider based on network
const getProvider = (network = 'polygon') => {
  const provider = providers[network.toLowerCase()];
  if (!provider) {
    logger.warn(`Provider for network ${network} not found, defaulting to Polygon`);
    return providers.polygon;
  }
  return provider;
};

// Get signer for transactions
const getSigner = (privateKey, network = 'polygon') => {
  const provider = getProvider(network);
  return new ethers.Wallet(privateKey || process.env.PRIVATE_KEY, provider);
};

// Contract ABIs (simplified, should be imported from artifacts in production)
const abis = {
  CropNFT: require('../../artifacts/contracts/CropNFT.sol/CropNFT.json').abi,
  PaymentProcessor: require('../../artifacts/contracts/PaymentProcessor.sol/PaymentProcessor.json').abi,
  PriceOracle: require('../../artifacts/contracts/PriceOracle.sol/PriceOracle.json').abi
};

// Contract factories
const getContractFactory = (contractName, signer, network = 'polygon') => {
  const provider = getProvider(network);
  const abi = abis[contractName];
  if (!abi) {
    throw new Error(`ABI for ${contractName} not found`);
  }
  
  const contractAddress = process.env[`${contractName.toUpperCase()}_ADDRESS`];
  if (!contractAddress) {
    throw new Error(`Contract address for ${contractName} not found in environment variables`);
  }
  
  return new ethers.Contract(contractAddress, abi, signer || provider);
};

// Helper function to parse units
const parseUnits = (amount, decimals = 18) => {
  return ethers.parseUnits(amount.toString(), decimals);
};

// Helper function to format units
const formatUnits = (amount, decimals = 18) => {
  return ethers.formatUnits(amount, decimals);
};

module.exports = {
  getProvider,
  getSigner,
  getContractFactory,
  parseUnits,
  formatUnits
};
