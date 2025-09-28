const IPFSService = require('../services/ipfsService');
const Crop = require('../models/Crop'); // Assuming a Crop model exists
const logger = require('../utils/logger');

class CropController {
  async createCrop(req, res) {
    try {
      const { images, ...cropData } = req.body; // Assuming images are sent in the request body
      const uploadedImages = await IPFSService.uploadCropImages(images, cropData.cropId);
      
      // Save crop data along with IPFS links
      const newCrop = await Crop.create({
        ...cropData,
        images: uploadedImages.map(image => image.url) // Store the URLs returned from IPFS
      });

      res.status(201).json(newCrop);
    } catch (error) {
      logger.error('Error creating crop:', error);
      res.status(500).json({ message: 'Failed to create crop' });
    }
  }

  // Additional methods for updating crops, etc. can be added here
}

module.exports = new CropController();