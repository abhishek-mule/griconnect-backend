const mongoose = require('mongoose');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const apiKeySchema = new mongoose.Schema({
  // API Key Identification
  keyId: {
    type: String,
    unique: true,
    required: true,
    default: () => `key_${uuidv4()}`
  },
  
  // API Key (hashed)
  key: {
    type: String,
    required: true,
    select: false
  },
  
  // API Key Prefix (first 8 characters of the original key)
  prefix: {
    type: String,
    required: true,
    index: true
  },
  
  // Key Name (for identification)
  name: {
    type: String,
    required: [true, 'API key name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  // Key Description
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Key Owner
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'API key owner is required'],
    index: true
  },
  
  // Permissions
  permissions: [{
    type: String,
    enum: [
      // General Permissions
      'read', 'write', 'delete', 'admin',
      
      // Specific Resource Permissions
      'users:read', 'users:write', 'users:delete',
      'crops:read', 'crops:write', 'crops:delete',
      'payments:read', 'payments:write', 'payments:refund',
      'transactions:read', 'transactions:create',
      'nft:mint', 'nft:transfer', 'nft:burn',
      'oracle:read', 'oracle:write',
      'notifications:read', 'notifications:send',
      'webhooks:manage'
    ]
  }],
  
  // IP Whitelist
  ipWhitelist: [{
    type: String,
    validate: {
      validator: function(v) {
        // Basic IP validation (supports IPv4 and IPv6)
        const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([0-9]|[1-2][0-9]|3[0-2]))?$/;
        const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(\/([0-9]|[1-9][0-9]|1[0-2][0-9]|3[0-2]))?$/;
        return ipv4Regex.test(v) || ipv6Regex.test(v);
      },
      message: props => `${props.value} is not a valid IP address or CIDR notation!`
    }
  }],
  
  // Referrer Whitelist (domains that can use this key from browser)
  referrerWhitelist: [{
    type: String,
    validate: {
      validator: function(v) {
        // Basic domain validation
        const domainRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/\S*)?$/;
        return domainRegex.test(v);
      },
      message: props => `${props.value} is not a valid domain!`
    }
  }],
  
  // Rate Limiting
  rateLimit: {
    windowMs: {
      type: Number,
      default: 15 * 60 * 1000, // 15 minutes
      min: 1000, // 1 second
      max: 24 * 60 * 60 * 1000 // 1 day
    },
    max: {
      type: Number,
      default: 100, // 100 requests per windowMs
      min: 1,
      max: 10000
    }
  },
  
  // Key Expiration
  expiresAt: {
    type: Date,
    index: true
  },
  
  // Last Used
  lastUsedAt: {
    type: Date,
    default: null
  },
  
  // Key Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Key Type
  type: {
    type: String,
    enum: ['public', 'secret', 'test', 'system'],
    default: 'secret'
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
apiKeySchema.index({ user: 1, isActive: 1 });
apiKeySchema.index({ prefix: 1, keyId: 1 }, { unique: true });
apiKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Pre-save hook to hash the API key
apiKeySchema.pre('save', async function(next) {
  // Only hash the key if it's new or has been modified
  if (this.isNew) {
    // Generate a random API key if not provided
    if (!this.key) {
      const apiKey = `ak_${crypto.randomBytes(32).toString('hex')}`;
      this.prefix = apiKey.substring(0, 8);
      this.key = await bcrypt.hash(apiKey, 12);
      // Store the plain key in a virtual field to show it once
      this._plainKey = apiKey;
    } else if (this.isModified('key')) {
      // If key is provided directly, hash it
      this.prefix = this.key.substring(0, 8);
      this.key = await bcrypt.hash(this.key, 12);
    }
  }
  
  // Set updatedAt timestamp
  this.updatedAt = new Date();
  
  next();
});

// Method to compare API key
apiKeySchema.methods.compareKey = async function(candidateKey) {
  return await bcrypt.compare(candidateKey, this.key);
};

// Method to check if API key has expired
apiKeySchema.methods.isExpired = function() {
  return this.expiresAt && this.expiresAt < new Date();
};

// Method to check if API key is valid for an IP
apiKeySchema.methods.isValidIp = function(ip) {
  // If no IP whitelist, allow all IPs
  if (!this.ipWhitelist || this.ipWhitelist.length === 0) {
    return true;
  }
  
  // Check if IP is in whitelist
  return this.ipWhitelist.some(allowedIp => {
    // Simple exact match
    if (allowedIp === ip) return true;
    
    // Check CIDR notation
    if (allowedIp.includes('/')) {
      const [subnet, prefix] = allowedIp.split('/');
      const subnetBytes = this.ipToBytes(subnet);
      const ipBytes = this.ipToBytes(ip);
      
      if (!subnetBytes || !ipBytes) return false;
      
      const prefixLength = parseInt(prefix, 10);
      const mask = this.createMask(prefixLength, subnetBytes.length * 8);
      
      for (let i = 0; i < subnetBytes.length; i++) {
        if ((subnetBytes[i] & mask[i]) !== (ipBytes[i] & mask[i])) {
          return false;
        }
      }
      
      return true;
    }
    
    return false;
  });
};

// Method to check if API key is valid for a referrer
apiKeySchema.methods.isValidReferrer = function(referrer) {
  // If no referrer whitelist, allow all referrers
  if (!this.referrerWhitelist || this.referrerWhitelist.length === 0) {
    return true;
  }
  
  // If no referrer provided, disallow if whitelist exists
  if (!referrer) return false;
  
  try {
    const referrerUrl = new URL(referrer);
    const referrerHost = referrerUrl.hostname;
    
    return this.referrerWhitelist.some(allowedDomain => {
      try {
        const domainUrl = new URL(allowedDomain.startsWith('http') ? allowedDomain : `https://${allowedDomain}`);
        const domainHost = domainUrl.hostname;
        
        // Exact match or subdomain match
        return referrerHost === domainHost || 
               (referrerHost.endsWith(`.${domainHost}`) && 
                referrerHost !== domainHost);
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    return false;
  }
};

// Helper method to convert IP to bytes
apiKeySchema.methods.ipToBytes = function(ip) {
  if (ip.includes(':')) {
    // IPv6
    const parts = ip.split(':');
    const bytes = new Uint8Array(16);
    let i = 0;
    
    for (const part of parts) {
      if (part === '') {
        // Handle :: shorthand
        const skip = 16 - (parts.length - 1) * 2;
        i += skip;
      } else {
        const value = parseInt(part, 16);
        bytes[i++] = (value >> 8) & 0xff;
        bytes[i++] = value & 0xff;
      }
    }
    
    return bytes;
  } else {
    // IPv4
    return new Uint8Array(ip.split('.').map(Number));
  }
};

// Helper method to create a bitmask
apiKeySchema.methods.createMask = function(prefixLength, totalBits) {
  const bytes = new Uint8Array(Math.ceil(totalBits / 8));
  
  for (let i = 0; i < bytes.length; i++) {
    const bits = Math.min(8, prefixLength - i * 8);
    if (bits > 0) {
      bytes[i] = ~(0xff >> bits) & 0xff;
    } else {
      bytes[i] = 0;
    }
  }
  
  return bytes;
};

// Method to update last used timestamp
apiKeySchema.methods.touch = async function() {
  this.lastUsedAt = new Date();
  await this.save();
};

// Static method to generate a new API key
apiKeySchema.statics.generateKey = async function(userId, options = {}) {
  const {
    name = 'New API Key',
    description = '',
    permissions = [],
    ipWhitelist = [],
    referrerWhitelist = [],
    rateLimit = {},
    expiresInDays = 365,
    type = 'secret'
  } = options;
  
  const apiKey = new this({
    name,
    description,
    user: userId,
    permissions,
    ipWhitelist,
    referrerWhitelist,
    rateLimit: {
      windowMs: rateLimit.windowMs || 15 * 60 * 1000,
      max: rateLimit.max || 100
    },
    expiresAt: expiresInDays ? 
      new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : 
      undefined,
    type
  });
  
  await apiKey.save();
  
  // Return the plain key (only available right after creation)
  return {
    id: apiKey.keyId,
    key: apiKey._plainKey,
    prefix: apiKey.prefix,
    name: apiKey.name,
    description: apiKey.description,
    permissions: apiKey.permissions,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt
  };
};

// Static method to validate an API key
apiKeySchema.statics.validateKey = async function(apiKey, options = {}) {
  if (!apiKey || typeof apiKey !== 'string') {
    return { isValid: false, reason: 'Invalid API key format' };
  }
  
  // Extract prefix (first 8 characters)
  const prefix = apiKey.substring(0, 8);
  
  // Find key by prefix
  const keyDoc = await this.findOne({ 
    prefix,
    isActive: true 
  }).select('+key');
  
  if (!keyDoc) {
    return { isValid: false, reason: 'Invalid API key' };
  }
  
  // Check if key is expired
  if (keyDoc.isExpired()) {
    return { 
      isValid: false, 
      reason: 'API key has expired',
      key: keyDoc 
    };
  }
  
  // Verify the key
  const isMatch = await keyDoc.compareKey(apiKey);
  
  if (!isMatch) {
    return { 
      isValid: false, 
      reason: 'Invalid API key',
      key: keyDoc 
    };
  }
  
  // Check IP whitelist if required
  if (options.ip && !keyDoc.isValidIp(options.ip)) {
    return { 
      isValid: false, 
      reason: 'IP address not allowed',
      key: keyDoc 
    };
  }
  
  // Check referrer whitelist if required
  if (options.referrer && !keyDoc.isValidReferrer(options.referrer)) {
    return { 
      isValid: false, 
      reason: 'Referrer not allowed',
      key: keyDoc 
    };
  }
  
  // Check required permissions if specified
  if (options.requiredPermissions && options.requiredPermissions.length > 0) {
    const hasAllPermissions = options.requiredPermissions.every(permission => 
      keyDoc.permissions.includes(permission) ||
      keyDoc.permissions.includes('admin')
    );
    
    if (!hasAllPermissions) {
      return { 
        isValid: false, 
        reason: 'Insufficient permissions',
        key: keyDoc 
      };
    }
  }
  
  // Update last used timestamp
  await keyDoc.touch();
  
  return { 
    isValid: true, 
    key: keyDoc 
  };
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
