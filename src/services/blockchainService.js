const { ethers } = require('ethers');

class BlockchainService {
  constructor() {
    this.networks = {
      ethereum: {
        name: 'Ethereum Mainnet',
        rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID',
        blockExplorer: 'https://etherscan.io'
      },
      polygon: {
        name: 'Polygon Mainnet',
        rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
        blockExplorer: 'https://polygonscan.com'
      },
      polygonMumbai: {
        name: 'Polygon Mumbai',
        rpcUrl: process.env.POLYGON_TESTNET_RPC_URL || 'https://rpc-mumbai.maticvigil.com',
        blockExplorer: 'https://mumbai.polygonscan.com'
      }
    };

    // Initialize providers for each network
    this.providers = {
      ethereum: new ethers.JsonRpcProvider(this.networks.ethereum.rpcUrl),
      polygon: new ethers.JsonRpcProvider(this.networks.polygon.rpcUrl),
      polygonMumbai: new ethers.JsonRpcProvider(this.networks.polygonMumbai.rpcUrl)
    };
    
    // Default provider
    this.defaultProvider = this.providers.ethereum;
  }

  async getNetworkStatus(networkName) {
    const network = this.networks[networkName.toLowerCase()];
    if (!network) {
      throw new Error(`Network ${networkName} not supported`);
    }

    try {
      const response = await fetch(network.rpcUrl);
      if (response.ok) {
        return { status: 'online', network };
      } else {
        return { status: 'offline', network };
      }
    } catch (error) {
      return { status: 'error', network, error: error.message };
    }
  }

  async getBlockNumber(networkName) {
    const networkKey = networkName.toLowerCase();
    const network = this.networks[networkKey];
    if (!network) {
      throw new Error(`Network ${networkName} not supported`);
    }

    try {
      const provider = this.providers[networkKey];
      const blockNumber = await provider.getBlockNumber();
      return { network, blockNumber };
    } catch (error) {
      throw new Error(`Failed to get block number for ${network.name}: ${error.message}`);
    }
  }
  
  // Get account balance using ethers.js
  async getBalance(address, networkName = 'ethereum') {
    const networkKey = networkName.toLowerCase();
    const network = this.networks[networkKey];
    if (!network) {
      throw new Error(`Network ${networkName} not supported`);
    }

    try {
      const provider = this.providers[networkKey];
      const balanceWei = await provider.getBalance(address);
      const balanceEth = ethers.formatEther(balanceWei);
      return { 
        address, 
        network: network.name, 
        balanceWei: balanceWei.toString(), 
        balanceEth 
      };
    } catch (error) {
      throw new Error(`Failed to get balance for ${address} on ${network.name}: ${error.message}`);
    }
  }
}

  // Create a wallet instance from private key
  createWallet(privateKey, networkName = 'ethereum') {
    const networkKey = networkName.toLowerCase();
    if (!this.networks[networkKey]) {
      throw new Error(`Network ${networkName} not supported`);
    }
    
    try {
      const provider = this.providers[networkKey];
      const wallet = new ethers.Wallet(privateKey, provider);
      return wallet;
    } catch (error) {
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
  }

  // Create contract instance
  createContract(contractAddress, abi, networkName = 'ethereum') {
    const networkKey = networkName.toLowerCase();
    if (!this.networks[networkKey]) {
      throw new Error(`Network ${networkName} not supported`);
    }
    
    try {
      const provider = this.providers[networkKey];
      return new ethers.Contract(contractAddress, abi, provider);
    } catch (error) {
      throw new Error(`Failed to create contract instance: ${error.message}`);
    }
  }

  // Send transaction
  async sendTransaction(tx, privateKey, networkName = 'ethereum') {
    const networkKey = networkName.toLowerCase();
    if (!this.networks[networkKey]) {
      throw new Error(`Network ${networkName} not supported`);
    }
    
    try {
      const wallet = this.createWallet(privateKey, networkName);
      const txResponse = await wallet.sendTransaction(tx);
      return {
        hash: txResponse.hash,
        wait: async () => await txResponse.wait()
      };
    } catch (error) {
      throw new Error(`Failed to send transaction: ${error.message}`);
    }
  }

  // Example of how to use the service with environment variables
  async exampleUsage() {
    // Using environment variables for private key and RPC URL
    const privateKey = process.env.PRIVATE_KEY;
    const networkName = 'polygon'; // Using Polygon network
    
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }
    
    // Create wallet
    const wallet = this.createWallet(privateKey, networkName);
    console.log(`Wallet address: ${wallet.address}`);
    
    // Get balance
    const balance = await this.getBalance(wallet.address, networkName);
    console.log(`Balance: ${balance.balanceEth} ETH`);
    
    // Get block number
    const blockInfo = await this.getBlockNumber(networkName);
    console.log(`Current block number: ${blockInfo.blockNumber}`);
    
    return {
      address: wallet.address,
      balance: balance.balanceEth,
      blockNumber: blockInfo.blockNumber
    };
  }
}

module.exports = new BlockchainService();