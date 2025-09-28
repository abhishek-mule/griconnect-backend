const axios = require('axios'); // Required for making HTTP requests and interacting with IPFS for decentralized storage and traceability of crop images and metadata
const FormData = require('form-data');
const logger = require('../utils/logger');

class IPFSService { // Service for managing IPFS interactions and uploads for crop images and metadata storage and traceability
  constructor() {
    this.pinataApiKey = process.env.PINATA_API_KEY;
    this.pinataSecretKey = process.env.PINATA_SECRET_KEY;
    this.pinataJWT = process.env.PINATA_JWT;
    this.pinataBaseUrl = 'https://api.pinata.cloud'; // Base URL for Pinata API to upload files and manage crop metadata and images for traceability
    this.gatewayUrl = 'https://gateway.pinata.cloud/ipfs';
  }

  /**
   * Test Pinata connection and authentication to ensure API keys are valid and operational for image uploads and metadata management for crops
   */
  async testConnection() {
    try {
      const response = await axios.get(
        `${this.pinataBaseUrl}/data/testAuthentication`,
        {
          headers: {
            'Authorization': `Bearer ${this.pinataJWT}`
          }
        }
      );
      logger.info('Pinata connection test successful:', response.data);
      return { success: true, message: 'Pinata is working correctly' };
    } catch (error) {
      logger.error('Pinata connection test failed:', error.response?.data || error.message);
      return { success: false, message: 'Pinata connection failed', error: error.response?.data || error.message };
    }
  }

  /**
   * Set up decentralized storage for images and metadata on IPFS
   */
  async uploadCropImages(images, cropId) { // Uploads crop images and metadata to IPFS, returning URLs
    try {
      const uploadedImages = []; // Array to store details of uploaded images

      // Validate images array
      if (!images || !Array.isArray(images) || images.length === 0) {
        logger.warn('No images provided for upload.');
        return [];
      }

      for (let i = 0; i < images.length; i++) { // Loop through each image for upload
        const image = images[i]; // Get current image
        const formData = new FormData(); // Create FormData object for each image

        // Validate image data
        if (!image?.buffer || !image?.mimetype) {
          logger.warn(`Invalid image data at index ${i + 1}. Skipping upload.`);
          continue; // Skip to the next image
        }

        // Add file buffer to FormData
        formData.append('file', image.buffer, {
          filename: `${cropId}_image_${i + 1}_${Date.now()}.${image.mimetype.split('/')[1]}`, // Set filename
          contentType: image.mimetype // Set content type
        });

        // Define metadata for Pinata
        const metadata = {
          name: `${cropId} - Image ${i + 1}`, // Image name
          keyvalues: { // Custom key-value pairs for easy searching
            cropId: cropId,
            imageType: 'crop_photo',
            uploadDate: new Date().toISOString(),
            imageIndex: (i + 1).toString()
          }
        };

        formData.append('pinataMetadata', JSON.stringify(metadata));

        // Upload to Pinata
        const response = await axios.post(
          `${this.pinataBaseUrl}/pinning/pinFileToIPFS`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
              'Authorization': `Bearer ${this.pinataJWT}`
            },
            maxBodyLength: Infinity
          }
        );

        uploadedImages.push({
          ipfsHash: response.data.IpfsHash,
          originalName: image.originalname,
          size: response.data.PinSize,
          timestamp: response.data.Timestamp,
          url: `${this.gatewayUrl}/${response.data.IpfsHash}`
        });
      }

      return uploadedImages;
    } catch (error) {
      logger.error('Error uploading crop images to IPFS:', error);
      throw error;
    }
  }
}

module.exports = IPFSService;