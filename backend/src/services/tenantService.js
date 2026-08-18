const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const TenantUser = require('../models/TenantUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

class TenantService {
  /**
   * Validates that a tenant exists and is accessible.
   * Throws if not found or inactive.
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @returns {Promise<import('../models/Tenant')>}
   */
  async validateTenantAccess(tenantId) {
    if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new Error('Invalid tenant identifier');
    }
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }
    if (!tenant.isActive) {
      throw new Error('Tenant is inactive or expired');
    }
    return tenant;
  }

  /**
   * Returns a MongoDB filter object that is always scoped to tenantId.
   * Use this as the base filter for every tenant-owned resource query so the
   * tenant constraint can never be accidentally dropped.
   *
   * Example:
   *   const filter = tenantService.scopedFilter(req.tenantId, { status: 'active' });
   *   const courses = await Course.find(filter);
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {object} [additionalFilter={}]
   * @returns {object}
   */
  scopedFilter(tenantId, additionalFilter = {}) {
    if (!tenantId) {
      throw new Error('tenantId is required — refusing to build an unscoped filter');
    }
    return { ...additionalFilter, tenantId };
  }

  /**
   * Asserts that a document belongs to the expected tenant.
   * Throws with a standardised message if the tenantId fields do not match,
   * so service methods can call this before returning any record to a caller.
   *
   * @param {object} document - Mongoose document with a tenantId field.
   * @param {string|mongoose.Types.ObjectId} expectedTenantId
   * @throws {Error} On mismatch.
   */
  assertTenantOwnership(document, expectedTenantId) {
    if (!document || !document.tenantId) {
      throw new Error('Resource not found');
    }
    if (document.tenantId.toString() !== expectedTenantId.toString()) {
      throw Object.assign(new Error('Cross-tenant access denied'), {
        code: 'CROSS_TENANT_ACCESS_DENIED'
      });
    }
  }

  /**
   * Create a new tenant
   */
  async createTenant(tenantData, adminUserData) {
    try {
      // Check if subdomain is available
      const existingTenant = await Tenant.findOne({
        $or: [
          { subdomain: tenantData.subdomain },
          { domain: tenantData.domain }
        ]
      });
      
      if (existingTenant) {
        throw new Error('Subdomain or domain already exists');
      }
      
      // Create tenant
      const tenant = new Tenant(tenantData);
      await tenant.save();
      
      // Create admin user for the tenant
      const adminUser = await this.createTenantUser(tenant._id, {
        ...adminUserData,
        roles: ['tenant_admin'],
        status: 'active'
      });
      
      // Update tenant usage
      await tenant.incrementUsage('users');
      
      return {
        tenant,
        adminUser,
        message: 'Tenant created successfully'
      };
    } catch (error) {
      throw new Error(`Failed to create tenant: ${error.message}`);
    }
  }
  
  /**
   * Create a user within a tenant.
   * Validates that the target tenant exists, is active, and is within its user
   * limit before creating the record.
   */
  async createTenantUser(tenantId, userData) {
    try {
      // Verify tenant exists and is active (includes ObjectId validation)
      const tenant = await this.validateTenantAccess(tenantId);

      // Check if user can be added (plan limits)
      if (!tenant.canAddUser()) {
        throw new Error('User limit exceeded for current plan');
      }

      // Check if email already exists in THIS tenant (scoped lookup)
      const existingUser = await TenantUser.findOne(
        this.scopedFilter(tenantId, { 'profile.email': userData.profile.email.toLowerCase() })
      );

      if (existingUser) {
        throw new Error('Email already exists in this tenant');
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.auth.password, 12);
      
      // Create user
      const user = new TenantUser({
        tenantId,
        ...userData,
        auth: {
          ...userData.auth,
          password: hashedPassword,
          emailVerificationToken: uuidv4(),
          emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
      });
      
      await user.save();
      
      // Update tenant usage
      await tenant.incrementUsage('users');
      
      // Remove sensitive data
      user.auth.password = undefined;
      
      return user;
    } catch (error) {
      throw new Error(`Failed to create tenant user: ${error.message}`);
    }
  }
  
  /**
   * Authenticate user within tenant context.
   * The user lookup is scoped to tenantId so credentials from tenant A can
   * never authenticate against tenant B.
   */
  async authenticateTenantUser(tenantId, email, password) {
    try {
      // Validate tenant first — rejects invalid/inactive tenants early
      await this.validateTenantAccess(tenantId);

      // Scoped user lookup: both tenantId AND email must match
      const user = await TenantUser.findOne(
        this.scopedFilter(tenantId, { 'profile.email': email.toLowerCase() })
      ).populate('tenantId');
      
      if (!user) {
        throw new Error('Invalid credentials');
      }
      
      // Check if account is locked
      if (user.auth.isLocked) {
        throw new Error('Account is locked due to too many failed attempts');
      }
      
      // Check if account is active
      if (user.status !== 'active') {
        throw new Error('Account is not active');
      }
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.auth.password);
      if (!isPasswordValid) {
        await user.incLoginAttempts();
        throw new Error('Invalid credentials');
      }
      
      // Reset login attempts on successful login
      await user.resetLoginAttempts();
      
      // Generate JWT tokens
      const tokens = this.generateTokens(user);
      
      // Update last activity
      user.activity.lastActive = new Date();
      await user.save();
      
      return {
        user: {
          id: user._id,
          profile: user.profile,
          roles: user.roles,
          permissions: user.permissions,
          tenant: user.tenantId
        },
        tokens
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }
  
  /**
   * Generate JWT tokens for user
   */
  generateTokens(user) {
    const accessToken = jwt.sign(
      {
        userId: user._id,
        tenantId: user.tenantId,
        roles: user.roles,
        email: user.profile.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      {
        userId: user._id,
        tenantId: user.tenantId
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    
    return { accessToken, refreshToken };
  }
  
  /**
   * Get tenant by subdomain or domain
   */
  async getTenantByDomain(domain) {
    try {
      return await Tenant.findByDomain(domain);
    } catch (error) {
      throw new Error(`Failed to get tenant: ${error.message}`);
    }
  }
  
  /**
   * Get tenant users with pagination and filtering.
   * All queries are scoped to tenantId — no cross-tenant reads are possible.
   */
  async getTenantUsers(tenantId, options = {}) {
    try {
      await this.validateTenantAccess(tenantId);
      const {
        page = 1,
        limit = 20,
        search,
        role,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      // Start with a tenant-scoped base filter
      const query = this.scopedFilter(tenantId);

      // Add optional filters
      if (search) {
        query.$or = [
          { 'profile.firstName': { $regex: search, $options: 'i' } },
          { 'profile.lastName': { $regex: search, $options: 'i' } },
          { 'profile.email': { $regex: search, $options: 'i' } }
        ];
      }

      if (role) {
        query.roles = role;
      }

      if (status) {
        query.status = status;
      }
      
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
      
      const users = await TenantUser.find(query)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('-auth.password -auth.emailVerificationToken -auth.passwordResetToken');
      
      const total = await TenantUser.countDocuments(query);
      
      return {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get tenant users: ${error.message}`);
    }
  }
  
  /**
   * Update tenant settings
   */
  async updateTenantSettings(tenantId, settings) {
    try {
      await this.validateTenantAccess(tenantId);
      const tenant = await Tenant.findByIdAndUpdate(
        tenantId,
        { $set: { settings: { ...settings } } },
        { new: true, runValidators: true }
      );
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      return tenant;
    } catch (error) {
      throw new Error(`Failed to update tenant settings: ${error.message}`);
    }
  }
  
  /**
   * Update tenant branding
   */
  async updateTenantBranding(tenantId, branding) {
    try {
      await this.validateTenantAccess(tenantId);
      const tenant = await Tenant.findByIdAndUpdate(
        tenantId,
        { $set: { branding: { ...branding } } },
        { new: true, runValidators: true }
      );
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      return tenant;
    } catch (error) {
      throw new Error(`Failed to update tenant branding: ${error.message}`);
    }
  }
  
  /**
   * Get tenant usage statistics
   */
  async getTenantUsage(tenantId) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      // Get detailed usage statistics
      const userStats = await TenantUser.aggregate([
        { $match: { tenantId: tenant._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      
      const roleStats = await TenantUser.aggregate([
        { $match: { tenantId: tenant._id } },
        { $unwind: '$roles' },
        {
          $group: {
            _id: '$roles',
            count: { $sum: 1 }
          }
        }
      ]);
      
      return {
        usage: tenant.usage,
        limits: {
          maxUsers: tenant.settings.maxUsers,
          maxStorage: tenant.settings.maxStorage
        },
        userStats: userStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        roleStats: roleStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        subscription: tenant.subscription,
        daysUntilExpiry: tenant.daysUntilExpiry
      };
    } catch (error) {
      throw new Error(`Failed to get tenant usage: ${error.message}`);
    }
  }
  
  /**
   * Suspend or activate tenant
   */
  async updateTenantStatus(tenantId, status) {
    try {
      await this.validateTenantAccess(tenantId);
      const tenant = await Tenant.findByIdAndUpdate(
        tenantId,
        { $set: { status } },
        { new: true, runValidators: true }
      );
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      // If suspending, also deactivate all users
      if (status === 'suspended') {
        await TenantUser.updateMany(
          { tenantId },
          { $set: { status: 'inactive' } }
        );
      } else if (status === 'active') {
        // If activating, reactivate users that were suspended due to tenant suspension
        await TenantUser.updateMany(
          { tenantId, status: 'inactive' },
          { $set: { status: 'active' } }
        );
      }
      
      return tenant;
    } catch (error) {
      throw new Error(`Failed to update tenant status: ${error.message}`);
    }
  }
  
  /**
   * Delete tenant and all associated data
   */
  async deleteTenant(tenantId) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      // Delete all tenant users
      await TenantUser.deleteMany({ tenantId });
      
      // TODO: Delete other tenant-related data (courses, content, etc.)
      
      // Delete tenant
      await Tenant.findByIdAndDelete(tenantId);
      
      return { message: 'Tenant deleted successfully' };
    } catch (error) {
      throw new Error(`Failed to delete tenant: ${error.message}`);
    }
  }
}

module.exports = new TenantService();
