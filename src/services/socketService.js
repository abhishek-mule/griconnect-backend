const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId
    this.roomSubscriptions = new Map(); // roomName -> Set of socketIds
  }

  /**
   * Initialize Socket.IO server
   */
  initialize(server) {
    this.io = socketIo(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    logger.info('Socket.IO server initialized');
  }

  /**
   * Setup authentication middleware
   */
  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach user info to socket
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;

        next();
      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.userId;
      const userRole = socket.userRole;

      logger.info(`User connected: ${userId} (${userRole}) - Socket: ${socket.id}`);

      // Track connected users
      this.connectedUsers.set(userId, socket.id);
      this.userSockets.set(socket.id, userId);

      // Join user-specific room
      socket.join(`user_${userId}`);

      // Join role-specific room
      socket.join(`role_${userRole}`);

      // Handle subscription to rooms
      socket.on('subscribe', (rooms) => {
        if (Array.isArray(rooms)) {
          rooms.forEach(room => {
            socket.join(room);
            if (!this.roomSubscriptions.has(room)) {
              this.roomSubscriptions.set(room, new Set());
            }
            this.roomSubscriptions.get(room).add(socket.id);
            logger.debug(`Socket ${socket.id} subscribed to room: ${room}`);
          });
        }
      });

      // Handle unsubscription from rooms
      socket.on('unsubscribe', (rooms) => {
        if (Array.isArray(rooms)) {
          rooms.forEach(room => {
            socket.leave(room);
            if (this.roomSubscriptions.has(room)) {
              this.roomSubscriptions.get(room).delete(socket.id);
            }
            logger.debug(`Socket ${socket.id} unsubscribed from room: ${room}`);
          });
        }
      });

      // Handle crop-related events
      socket.on('join_crop_room', (cropId) => {
        socket.join(`crop_${cropId}`);
        logger.debug(`User ${userId} joined crop room: ${cropId}`);
      });

      socket.on('leave_crop_room', (cropId) => {
        socket.leave(`crop_${cropId}`);
        logger.debug(`User ${userId} left crop room: ${cropId}`);
      });

      // Handle payment-related events
      socket.on('join_payment_room', (paymentId) => {
        socket.join(`payment_${paymentId}`);
        logger.debug(`User ${userId} joined payment room: ${paymentId}`);
      });

      socket.on('leave_payment_room', (paymentId) => {
        socket.leave(`payment_${paymentId}`);
        logger.debug(`User ${userId} left payment room: ${paymentId}`);
      });

      // Handle typing indicators
      socket.on('typing_start', (data) => {
        socket.to(data.room).emit('user_typing', {
          userId,
          username: data.username,
          room: data.room
        });
      });

      socket.on('typing_stop', (data) => {
        socket.to(data.room).emit('user_stopped_typing', {
          userId,
          room: data.room
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info(`User disconnected: ${userId} - Socket: ${socket.id} - Reason: ${reason}`);

        // Clean up tracking
        this.connectedUsers.delete(userId);
        this.userSockets.delete(socket.id);

        // Clean up room subscriptions
        this.roomSubscriptions.forEach((sockets, room) => {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            this.roomSubscriptions.delete(room);
          }
        });
      });

      // Send welcome message
      socket.emit('connected', {
        userId,
        socketId: socket.id,
        timestamp: new Date()
      });
    });
  }

  /**
   * Send notification to specific user
   */
  notifyUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, {
        ...data,
        timestamp: new Date(),
        recipient: userId
      });
      logger.debug(`Notification sent to user ${userId}: ${event}`);
      return true;
    }
    return false;
  }

  /**
   * Send notification to all users with specific role
   */
  notifyRole(role, event, data) {
    this.io.to(`role_${role}`).emit(event, {
      ...data,
      timestamp: new Date(),
      recipientRole: role
    });
    logger.debug(`Notification sent to role ${role}: ${event}`);
  }

  /**
   * Send notification to all users in a room
   */
  notifyRoom(room, event, data, excludeSocketId = null) {
    const emitter = excludeSocketId ? this.io.to(room).except(excludeSocketId) : this.io.to(room);
    emitter.emit(event, {
      ...data,
      timestamp: new Date(),
      room
    });
    logger.debug(`Notification sent to room ${room}: ${event}`);
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(event, data) {
    this.io.emit(event, {
      ...data,
      timestamp: new Date()
    });
    logger.debug(`Broadcast sent: ${event}`);
  }

  /**
   * Payment-related notifications
   */
  notifyPaymentUpdate(paymentId, paymentData, action = 'updated') {
    // Notify payment room
    this.notifyRoom(`payment_${paymentId}`, 'payment_update', {
      paymentId,
      action,
      payment: paymentData
    });

    // Notify payer and payee
    if (paymentData.payer) {
      this.notifyUser(paymentData.payer.toString(), 'payment_update', {
        paymentId,
        action,
        payment: paymentData,
        isPayee: false
      });
    }

    if (paymentData.payee) {
      this.notifyUser(paymentData.payee.toString(), 'payment_update', {
        paymentId,
        action,
        payment: paymentData,
        isPayee: true
      });
    }

    // Notify admins
    this.notifyRole('admin', 'payment_update', {
      paymentId,
      action,
      payment: paymentData
    });
  }

  /**
   * Crop-related notifications
   */
  notifyCropUpdate(cropId, cropData, action = 'updated') {
    // Notify crop room
    this.notifyRoom(`crop_${cropId}`, 'crop_update', {
      cropId,
      action,
      crop: cropData
    });

    // Notify farmer
    if (cropData.farmer) {
      this.notifyUser(cropData.farmer.toString(), 'crop_update', {
        cropId,
        action,
        crop: cropData
      });
    }

    // If crop is sold/listed, notify relevant users
    if (action === 'listed' || action === 'sold') {
      // Could notify buyers in the region, etc.
      this.notifyRole('buyer', 'new_crop_available', {
        cropId,
        crop: cropData
      });
    }
  }

  /**
   * NFT-related notifications
   */
  notifyNFTMinted(cropId, nftData) {
    // Notify crop room
    this.notifyRoom(`crop_${cropId}`, 'nft_minted', {
      cropId,
      nft: nftData
    });

    // Notify farmer
    if (nftData.recipient) {
      this.notifyUser(nftData.recipient, 'nft_minted', {
        cropId,
        nft: nftData
      });
    }
  }

  /**
   * Transaction-related notifications
   */
  notifyTransactionUpdate(txHash, txData, status) {
    // Notify user if we can identify them (would need to track user transactions)
    this.broadcast('transaction_update', {
      txHash,
      transaction: txData,
      status
    });
  }

  /**
   * System-wide notifications
   */
  notifySystemUpdate(message, type = 'info', targetUsers = null) {
    const notification = {
      message,
      type, // 'info', 'warning', 'error', 'success'
      timestamp: new Date()
    };

    if (targetUsers) {
      // Send to specific users
      targetUsers.forEach(userId => {
        this.notifyUser(userId, 'system_notification', notification);
      });
    } else {
      // Broadcast to all
      this.broadcast('system_notification', notification);
    }
  }

  /**
   * Market-related notifications
   */
  notifyPriceAlert(crypto, priceData, alertType) {
    this.notifyRole('farmer', 'price_alert', {
      crypto,
      priceData,
      alertType,
      message: `Price alert for ${crypto}: ${alertType}`
    });

    this.notifyRole('buyer', 'price_alert', {
      crypto,
      priceData,
      alertType,
      message: `Price alert for ${crypto}: ${alertType}`
    });
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  /**
   * Get active rooms
   */
  getActiveRooms() {
    return Array.from(this.roomSubscriptions.keys());
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }

  /**
   * Get user's socket ID
   */
  getUserSocketId(userId) {
    return this.connectedUsers.get(userId);
  }

  /**
   * Force disconnect user
   */
  disconnectUser(userId, reason = 'Administrative action') {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('force_disconnect', { reason });
        socket.disconnect(true);
        logger.info(`User ${userId} force disconnected: ${reason}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      service: 'socket-service',
      status: this.io ? 'healthy' : 'unhealthy',
      connectedUsers: this.connectedUsers.size,
      activeRooms: this.roomSubscriptions.size,
      timestamp: new Date()
    };
  }
}

module.exports = new SocketService();