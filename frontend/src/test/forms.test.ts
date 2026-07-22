// Pure-schema tests for issue #184: loginSchema, registerSchema,
// courseSchema, credentialIssuanceSchema.

import {
  loginSchema,
  registerSchema,
  courseSchema,
  credentialIssuanceSchema,
} from '../lib/schemas';

// ─────────────────────────────────────────────────────────────────────────────
// loginSchema
// ─────────────────────────────────────────────────────────────────────────────
describe('loginSchema', () => {
  const valid = { email: 'user@example.com', password: 'secret' };

  it('accepts valid credentials', () => {
    expect(loginSchema.safeParse(valid).success).toBe(true);
  });

  it('defaults rememberMe to false when omitted', () => {
    const r = loginSchema.safeParse(valid);
    expect(r.success && r.data.rememberMe).toBe(false);
  });

  it('accepts rememberMe=true', () => {
    expect(loginSchema.safeParse({ ...valid, rememberMe: true }).success).toBe(true);
  });

  it('rejects empty email', () => {
    const r = loginSchema.safeParse({ ...valid, email: '' });
    expect(r.success).toBe(false);
  });

  it('rejects malformed email', () => {
    const r = loginSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/valid email/i);
  });

  it('rejects empty password', () => {
    const r = loginSchema.safeParse({ ...valid, password: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/required/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// registerSchema
// ─────────────────────────────────────────────────────────────────────────────
describe('registerSchema', () => {
  const valid = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'Secure1pass',
    confirmPassword: 'Secure1pass',
    acceptTerms: true,
  };

  it('accepts a valid payload', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects single-character name', () => {
    const r = registerSchema.safeParse({ ...valid, name: 'A' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/at least 2 characters/i);
  });

  it('rejects invalid email', () => {
    const r = registerSchema.safeParse({ ...valid, email: 'bad' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/valid email/i);
  });

  it('rejects password shorter than 8 characters', () => {
    const pw = 'Ab1';
    const r = registerSchema.safeParse({ ...valid, password: pw, confirmPassword: pw });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/at least 8 characters/i);
  });

  it('rejects password without uppercase', () => {
    const pw = 'nouppercase1';
    const r = registerSchema.safeParse({ ...valid, password: pw, confirmPassword: pw });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/uppercase/i);
  });

  it('rejects password without lowercase', () => {
    const pw = 'NOLOWER123';
    const r = registerSchema.safeParse({ ...valid, password: pw, confirmPassword: pw });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/lowercase/i);
  });

  it('rejects password without a number', () => {
    const pw = 'NoNumbersHere';
    const r = registerSchema.safeParse({ ...valid, password: pw, confirmPassword: pw });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/number/i);
  });

  it('rejects when passwords do not match', () => {
    const r = registerSchema.safeParse({ ...valid, confirmPassword: 'Different1' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.includes('confirmPassword'));
      expect(issue?.message).toMatch(/do not match/i);
    }
  });

  it('rejects when terms not accepted', () => {
    const r = registerSchema.safeParse({ ...valid, acceptTerms: false });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.includes('acceptTerms'));
      expect(issue?.message).toMatch(/terms/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// courseSchema
// ─────────────────────────────────────────────────────────────────────────────
describe('courseSchema', () => {
  const valid = {
    title: 'Intro to Stellar',
    description: 'Learn the fundamentals of the Stellar blockchain platform.',
    category: 'blockchain',
    difficulty: 'beginner',
    price: '10',
    currency: 'XLM',
    duration: '4 weeks',
    prerequisites: '',
    tags: '',
    isPublished: false,
  };

  it('accepts a complete valid course', () => {
    expect(courseSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts price of 0 (free course)', () => {
    expect(courseSchema.safeParse({ ...valid, price: '0' }).success).toBe(true);
  });

  it('accepts decimal price', () => {
    expect(courseSchema.safeParse({ ...valid, price: '9.99' }).success).toBe(true);
  });

  it('rejects title shorter than 5 characters', () => {
    const r = courseSchema.safeParse({ ...valid, title: 'ABC' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/at least 5 characters/i);
  });

  it('rejects description shorter than 20 characters', () => {
    const r = courseSchema.safeParse({ ...valid, description: 'Too short' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/at least 20 characters/i);
  });

  it('rejects unknown category', () => {
    expect(courseSchema.safeParse({ ...valid, category: 'magic' }).success).toBe(false);
  });

  it('rejects unknown difficulty', () => {
    expect(courseSchema.safeParse({ ...valid, difficulty: 'expert' }).success).toBe(false);
  });

  it('rejects negative price', () => {
    const r = courseSchema.safeParse({ ...valid, price: '-5' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/negative|valid price/i);
  });

  it('rejects alphabetic price string', () => {
    expect(courseSchema.safeParse({ ...valid, price: 'free' }).success).toBe(false);
  });

  it('rejects unknown currency', () => {
    expect(courseSchema.safeParse({ ...valid, currency: 'BTC' }).success).toBe(false);
  });

  it('rejects empty duration', () => {
    const r = courseSchema.safeParse({ ...valid, duration: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/required/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// credentialIssuanceSchema
// ─────────────────────────────────────────────────────────────────────────────
describe('credentialIssuanceSchema', () => {
  const today = new Date().toISOString().split('T')[0];

  const valid = {
    recipientName: 'Bob Smith',
    recipientEmail: 'bob@example.com',
    recipientWalletAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    credentialType: 'certificate',
    credentialTitle: 'Stellar Developer',
    description: 'Awarded for completing the advanced Stellar course.',
    courseId: '',
    issueDate: today,
    expirationDate: '',
    metadata: '',
  };

  it('accepts a complete valid credential', () => {
    expect(credentialIssuanceSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts without optional fields', () => {
    const { courseId: _c, expirationDate: _e, metadata: _m, ...minimal } = valid;
    expect(credentialIssuanceSchema.safeParse(minimal).success).toBe(true);
  });

  it('rejects missing recipient name', () => {
    const r = credentialIssuanceSchema.safeParse({ ...valid, recipientName: '' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid recipient email', () => {
    const r = credentialIssuanceSchema.safeParse({ ...valid, recipientEmail: 'not-email' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/valid email/i);
  });

  it('rejects missing wallet address', () => {
    const r = credentialIssuanceSchema.safeParse({ ...valid, recipientWalletAddress: '' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown credential type', () => {
    expect(credentialIssuanceSchema.safeParse({ ...valid, credentialType: 'medal' }).success).toBe(false);
  });

  it('rejects credential title shorter than 3 characters', () => {
    const r = credentialIssuanceSchema.safeParse({ ...valid, credentialTitle: 'AB' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/at least 3 characters/i);
  });

  it('rejects description shorter than 10 characters', () => {
    const r = credentialIssuanceSchema.safeParse({ ...valid, description: 'Too short' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/at least 10 characters/i);
  });

  it('rejects issue date in wrong format', () => {
    const r = credentialIssuanceSchema.safeParse({ ...valid, issueDate: '22-07-2026' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('issueDate'))).toBe(true);
    }
  });

  it('rejects empty issue date', () => {
    expect(credentialIssuanceSchema.safeParse({ ...valid, issueDate: '' }).success).toBe(false);
  });

  it('accepts a valid expiration date', () => {
    expect(credentialIssuanceSchema.safeParse({ ...valid, expirationDate: '2030-12-31' }).success).toBe(true);
  });

  it('rejects expiration date in wrong format', () => {
    expect(credentialIssuanceSchema.safeParse({ ...valid, expirationDate: '31/12/2030' }).success).toBe(false);
  });
});
