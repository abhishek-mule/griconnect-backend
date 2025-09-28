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

    // Default network key
    this.defaultNetwork = 'polygon';
  }

  // Internal helper to pick a provider
  getProvider(networkName = this.defaultNetwork) {
    const key = (networkName || this.defaultNetwork).toLowerCase();
    const provider = this.providers[key];
    if (!provider) throw new Error(`Network ${networkName} not supported`);
    return provider;
  }

  async getNetworkStatus(networkName = this.defaultNetwork) {
    const key = networkName.toLowerCase();
    const network = this.networks[key];
    if (!network) throw new Error(`Network ${networkName} not supported`);
    try {
      const provider = this.getProvider(networkName);
      const bn = await provider.getBlockNumber();
      return { status: 'online', network, latestBlock: bn };
    } catch (error) {
      return { status: 'error', network, error: error.message };
    }
  }

  async getBlockNumber(networkName = this.defaultNetwork) {
    const provider = this.getProvider(networkName);
    const bn = await provider.getBlockNumber();
    return { network: this.networks[networkName.toLowerCase()], blockNumber: bn };
  }

  // Get account balance using ethers.js
  async getWalletBalance(address, networkName = this.defaultNetwork) {
    const provider = this.getProvider(networkName);
    const balanceWei = await provider.getBalance(address);
    const balanceEth = ethers.formatEther(balanceWei);
    return {
      address,
      network: this.networks[networkName.toLowerCase()].name,
      balanceWei: balanceWei.toString(),
      balanceEth
    };
  }

  // Transaction helpers
  async getTransactionDetails(txHash, networkName = this.defaultNetwork) {
    const provider = this.getProvider(networkName);
    const tx = await provider.getTransaction(txHash);
    return tx;
  }

  async estimateGasCost(tx, networkName = this.defaultNetwork) {
    const provider = this.getProvider(networkName);
    const gas = await provider.estimateGas(tx);
    const feeData = await provider.getFeeData();
    return {
      gas: gas.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString() || null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || null
    };
  }

  // Wallet and contract helpers
  createWallet(privateKey, networkName = this.defaultNetwork) {
    const provider = this.getProvider(networkName);
    return new ethers.Wallet(privateKey, provider);
  }

  createContract(contractAddress, abi, networkName = this.defaultNetwork) {
    const provider = this.getProvider(networkName);
    return new ethers.Contract(contractAddress, abi, provider);
  }

  async sendTransaction(tx, privateKey, networkName = this.defaultNetwork) {
    const wallet = this.createWallet(privateKey, networkName);
    const txResponse = await wallet.sendTransaction(tx);
    return { hash: txResponse.hash, wait: async () => await txResponse.wait() };
  }

  // High-level API used by routes (stubbed where contracts are required)
  async mintCropNFT(crop, recipient, networkName = this.defaultNetwork) {
    // To fully implement, integrate your NFT contract here.
    // Stub to avoid boot-time crashes on Render.
    throw new Error('mintCropNFT not implemented: deploy and wire NFT contract');
  }

  async getNFTDetails(tokenId, networkName = this.defaultNetwork) {
    // Stub: would call NFT contract tokenURI/ownerOf, etc.
    throw new Error('getNFTDetails not implemented: deploy and wire NFT contract');
  }

  async transferNFT(fromAddress, toAddress, tokenId, networkName = this.defaultNetwork) {
    // Stub: would require signer and contract.
    throw new Error('transferNFT not implemented: deploy and wire NFT contract');
  }

  async createBlockchainPayment(fromAddress, toAddress, amount, description = '', networkName = this.defaultNetwork) {
    // Stub for on-chain payment/or escrow logic.
    throw new Error('createBlockchainPayment not implemented');
  }

  async releaseBlockchainPayment(paymentId, networkName = this.defaultNetwork) {
    // Stub for escrow release logic.
    throw new Error('releaseBlockchainPayment not implemented');
  }

  async getNetworkInfo(networkName = this.defaultNetwork) {
    const key = networkName.toLowerCase();
    const network = this.networks[key];
    const provider = this.getProvider(networkName);
    const [blockNumber, feeData] = await Promise.all([
      provider.getBlockNumber(),
      provider.getFeeData()
    ]);
    return {
      name: network.name,
      rpcUrl: network.rpcUrl,
      blockExplorer: network.blockExplorer,
      blockNumber,
      feeData: {
        gasPrice: feeData.gasPrice?.toString() || null,
        maxFeePerGas: feeData.maxFeePerGas?.toString() || null,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || null
      }
    };
  }
}

module.exports = new BlockchainService();
