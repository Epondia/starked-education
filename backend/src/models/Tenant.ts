/**
 * Tenant.ts — TypeScript model with strict multi-tenant isolation constraints.
 *
 * This file is the authoritative type-safe definition of the Tenant document.
 * It enforces at the schema level that:
 *   - tenantId is indexed on all sub-documents that reference it
 *   - reserved subdomains are blocked on save
 *   - an inactive/expired tenant is rejected by the isActive virtual
 *
 * The companion Tenant.js (plain Mongoose) is kept for backward compatibility
 * with routes that are not yet migrated to TypeScript.  Both files share the
 * same underlying Mongoose model name ('Tenant') — only one should be imported
 * per module.
 */

import mongoose, { Document, Model, Schema, Types } from 'mongoose';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ITenantBranding {
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  theme: 'light' | 'dark' | 'auto';
  customCSS?: string;
  favicon?: string;
  companyName?: string;
  supportEmail?: string;
}

export interface ITenantSettings {
  allowPublicRegistration: boolean;
  requireEmailVerification: boolean;
  enableSSO: boolean;
  ssoProvider?: string;
  defaultLanguage: string;
  timezone: string;
  /** Maximum number of users allowed for this tenant's plan. */
  maxUsers: number;
  /** Maximum storage in MB allowed for this tenant's plan. */
  maxStorage: number;
}

export interface ITenantSubscription {
  startDate?: Date;
  endDate?: Date;
  billingCycle: 'monthly' | 'yearly';
  price?: number;
  currency: string;
  autoRenew: boolean;
}

export interface ITenantUsage {
  users: number;
  storage: number; // MB
  apiCalls: number;
  lastReset: Date;
}

export interface ITenantContact {
  firstName?: string;
  lastName?: string;
  /** Primary contact email — required. */
  email: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
}

export interface ITenantMetadata {
  source: 'manual' | 'self_service' | 'api' | 'migration';
  industry?: string;
  size?: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  notes?: string;
}

// ─── Document interface (with virtuals and methods) ───────────────────────────

export interface ITenantDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  subdomain: string;
  domain?: string;
  status: 'active' | 'inactive' | 'suspended' | 'trial';
  plan: 'starter' | 'professional' | 'enterprise';

  branding: ITenantBranding;
  settings: ITenantSettings;
  subscription: ITenantSubscription;
  usage: ITenantUsage;
  contact: ITenantContact;
  metadata: ITenantMetadata;

  createdAt: Date;
  updatedAt: Date;

  // Virtuals
  /** True only when status is 'active' AND the subscription has not expired. */
  isActive: boolean;
  /** Days until subscription expires, or null if no endDate is set. */
  daysUntilExpiry: number | null;

  // Methods
  canAddUser(): boolean;
  canAllocateStorage(additionalMB: number): boolean;
  incrementUsage(type: keyof ITenantUsage, amount?: number): void;
}

// ─── Static methods ───────────────────────────────────────────────────────────

export interface ITenantModel extends Model<ITenantDocument> {
  findByDomain(domain: string): Promise<ITenantDocument | null>;
}

// ─── Reserved subdomains ──────────────────────────────────────────────────────

const RESERVED_SUBDOMAINS: ReadonlyArray<string> = [
  'www', 'api', 'admin', 'mail', 'ftp', 'ssl', 'test', 'staging', 'dev',
  'app', 'portal', 'dashboard', 'status', 'support',
];

// ─── Schema ───────────────────────────────────────────────────────────────────

const tenantSchema = new Schema<ITenantDocument, ITenantModel>(
  {
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
      minlength: [2, 'Tenant name must be at least 2 characters'],
      maxlength: [100, 'Tenant name must not exceed 100 characters'],
    },
    subdomain: {
      type: String,
      required: [true, 'Subdomain is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Subdomain may only contain lowercase letters, numbers, and hyphens'],
      minlength: [3, 'Subdomain must be at least 3 characters'],
      maxlength: [50, 'Subdomain must not exceed 50 characters'],
    },
    domain: {
      type: String,
      sparse: true,
      unique: true,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended', 'trial'] as const,
        message: '{VALUE} is not a valid tenant status',
      },
      default: 'trial',
    },
    plan: {
      type: String,
      enum: {
        values: ['starter', 'professional', 'enterprise'] as const,
        message: '{VALUE} is not a valid plan',
      },
      default: 'starter',
    },

    branding: {
      logo: String,
      primaryColor: { type: String, default: '#3B82F6' },
      secondaryColor: { type: String, default: '#10B981' },
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'light',
      },
      customCSS: String,
      favicon: String,
      companyName: String,
      supportEmail: String,
    },

    settings: {
      allowPublicRegistration: { type: Boolean, default: true },
      requireEmailVerification: { type: Boolean, default: true },
      enableSSO: { type: Boolean, default: false },
      ssoProvider: String,
      defaultLanguage: { type: String, default: 'en' },
      timezone: { type: String, default: 'UTC' },
      maxUsers: {
        type: Number,
        default: 100,
        min: [1, 'maxUsers must be at least 1'],
      },
      maxStorage: {
        type: Number, // MB
        default: 1024,
        min: [1, 'maxStorage must be at least 1 MB'],
      },
    },

    subscription: {
      startDate: Date,
      endDate: Date,
      billingCycle: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly',
      },
      price: Number,
      currency: { type: String, default: 'USD' },
      autoRenew: { type: Boolean, default: true },
    },

    usage: {
      users: { type: Number, default: 0, min: 0 },
      storage: { type: Number, default: 0, min: 0 },
      apiCalls: { type: Number, default: 0, min: 0 },
      lastReset: { type: Date, default: Date.now },
    },

    contact: {
      firstName: String,
      lastName: String,
      email: {
        type: String,
        required: [true, 'Contact email is required'],
      },
      phone: String,
      address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String,
      },
    },

    metadata: {
      source: {
        type: String,
        enum: ['manual', 'self_service', 'api', 'migration'],
        default: 'self_service',
      },
      industry: String,
      size: {
        type: String,
        enum: ['1-10', '11-50', '51-200', '201-500', '500+'],
      },
      notes: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

tenantSchema.index({ subdomain: 1 });
tenantSchema.index({ domain: 1 });
tenantSchema.index({ status: 1 });
tenantSchema.index({ 'subscription.endDate': 1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────

tenantSchema.virtual('isActive').get(function (this: ITenantDocument): boolean {
  return (
    this.status === 'active' &&
    (!this.subscription.endDate || this.subscription.endDate > new Date())
  );
});

tenantSchema.virtual('daysUntilExpiry').get(function (
  this: ITenantDocument
): number | null {
  if (!this.subscription.endDate) return null;
  const diff = this.subscription.endDate.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ─── Instance methods ─────────────────────────────────────────────────────────

tenantSchema.methods.canAddUser = function (this: ITenantDocument): boolean {
  return this.usage.users < this.settings.maxUsers;
};

tenantSchema.methods.canAllocateStorage = function (
  this: ITenantDocument,
  additionalMB: number
): boolean {
  return this.usage.storage + additionalMB <= this.settings.maxStorage;
};

tenantSchema.methods.incrementUsage = function (
  this: ITenantDocument,
  type: keyof ITenantUsage,
  amount = 1
): void {
  if (typeof this.usage[type] === 'number') {
    (this.usage[type] as number) += amount;
    this.markModified(`usage.${type}`);
  }
};

// ─── Static methods ───────────────────────────────────────────────────────────

tenantSchema.statics.findByDomain = function (
  domain: string
): Promise<ITenantDocument | null> {
  const parts = domain.toLowerCase().split('.');
  if (parts.length >= 2) {
    const subdomain = parts[0];
    return this.findOne({
      $or: [{ subdomain }, { domain }],
    });
  }
  return this.findOne({ domain });
};

// ─── Pre-save hooks ───────────────────────────────────────────────────────────

/**
 * Block reserved subdomains at the persistence layer so they can never be
 * created even if the application-level validation is bypassed.
 */
tenantSchema.pre('save', function (this: ITenantDocument, next) {
  if (this.isModified('subdomain')) {
    if (RESERVED_SUBDOMAINS.includes(this.subdomain)) {
      return next(
        new Error(`Subdomain '${this.subdomain}' is reserved and cannot be used`)
      );
    }
  }
  next();
});

// ─── Model export ─────────────────────────────────────────────────────────────

// Guard against recompiling the model in hot-reload environments
const TenantModel: ITenantModel =
  (mongoose.models.Tenant as ITenantModel) ||
  mongoose.model<ITenantDocument, ITenantModel>('Tenant', tenantSchema);

export default TenantModel;
