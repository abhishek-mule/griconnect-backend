const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
require('dotenv').config();

const cropRoutes = require('./src/routes/crop'); // Import crop routes

// Add crop routes to the application

// Import services
const priceOracleService = require('./src/services/priceOracleService');
const socketService = require('./src/services/socketService');
const logger = require('./src/utils/logger');

const app = express();

// Minimal health check registered early so platform probes succeed during init
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/crop', cropRoutes);
const httpServer = createServer(app);

// Initialize Socket.IO service
socketService.initialize(httpServer);
const io = socketService.io;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https:", "data:", "https://gateway.pinata.cloud"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https:", "wss:"]
    }
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-razorpay-signature']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Socket.IO for real-time updates
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Database connection with retry logic
const connectDB = async () => {
  try {
    // Fail fast if required env vars are missing (prevents 'openUri(undefined)' crash)
    const requiredEnvs = ['MONGODB_URI'];
    const missing = requiredEnvs.filter((k) => !process.env[k] || !String(process.env[k]).trim());
    if (missing.length) {
      console.error(`❌ Missing required environment variables: ${missing.join(', ')}. Set them in your Render service or a .env file.`);
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

connectDB();

// Routes
const authRoutes = require('./src/routes/auth');
app.use('/api/auth', authRoutes);
const paymentRoutes = require('./src/routes/payment');
app.use('/api/payment', paymentRoutes);
const priceOracleRoutes = require('./src/routes/priceOracle');
app.use('/api/price-oracle', priceOracleRoutes);
const aiRoutes = require('./src/routes/ai');
app.use('/api/ai', aiRoutes);
const blockchainRoutes = require('./src/routes/blockchain');
app.use('/api/blockchain', blockchainRoutes);

// Health check with detailed status
app.get('/health', async (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      blockchain: 'checking...',
      ipfs: 'checking...',
      ai: 'checking...'
    }
  };

  res.json(healthStatus);
});

// Public endpoint for frontend to fetch current contract addresses
app.get('/contracts', (req, res) => {
  const network = process.env.BLOCKCHAIN_NETWORK || 'polygon-amoy';
  res.json({
    network,
    addresses: {
      cropNft: process.env.CROP_NFT_CONTRACT_ADDRESS || null,
      payment: process.env.CONTRACT_ADDRESS || null
    },
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint for Razorpay (raw body needed)
app.use('/api/webhook', express.raw({type: 'application/json'}));

// Global error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Something went wrong on our end'
    });
  } else {
    res.status(err.status || 500).json({
      error: err.message,
      stack: err.stack
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Scheduled tasks
// Update price oracle every 15 minutes
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('*/15 * * * *', async () => {
    try {
      await priceOracleService.updatePrices();
      console.log('Price oracle updated successfully');
    } catch (error) {
      console.error('Price oracle update failed:', error);
    }
  });
}

// Server startup
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS enabled for: ${process.env.CORS_ORIGIN || '*'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});

module.exports = { app, io };
