const express = require('express');
const router = express.Router();
const CropController = require('../controllers/cropController');

// Route for creating a new crop
router.post('/', CropController.createCrop);

// Additional routes for updating crops can be added here

module.exports = router;