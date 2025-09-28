// Set your Pinata JWT here for testing
process.env.PINATA_JWT = 'YOUR_PINATA_JWT_HERE'; // Replace with your actual JWT

const IPFSService = require('./src/services/ipfsService');

async function testPinata() {
  const ipfsService = new IPFSService();
  const result = await ipfsService.testConnection();
  console.log('Test Result:', result);
}

testPinata().catch(console.error);