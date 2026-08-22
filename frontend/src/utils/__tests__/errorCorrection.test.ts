import {
  calculateParityBits,
  verifyAndCorrectData,
  generateChecksum,
  verifyChecksum,
  createErrorCorrectionData,
  applyErrorCorrection,
  calculateErrorRate,
  isErrorRateAcceptable,
  generateQuantumSafeHash,
  verifyQuantumSafeHash,
} from '../errorCorrection';

describe('calculateParityBits', () => {
  it('returns three parity bits for Hamming(7,4)', () => {
    expect(calculateParityBits([1, 0, 1, 0])).toHaveLength(3);
  });

  it('is consistent for the same input', () => {
    const data = [1, 0, 1, 1, 0, 0, 1];
    expect(calculateParityBits(data)).toEqual(calculateParityBits(data));
  });
});

describe('verifyAndCorrectData', () => {
  it('reports no error for uncorrupted data', () => {
    const data = [1, 0, 1, 1];
    const parity = calculateParityBits(data);

    const result = verifyAndCorrectData(data, parity);
    expect(result.errorPosition).toBeNull();
    expect(result.corrected).toEqual(data);
  });

  it('corrects a single-bit error', () => {
    const data = [1, 0, 1, 1];
    const parity = calculateParityBits(data);

    // Flip one bit to simulate a transmission error.
    const corrupted = [...data];
    corrupted[2] = corrupted[2] === 1 ? 0 : 1;

    const result = verifyAndCorrectData(corrupted, parity);
    expect(result.errorPosition).not.toBeNull();
    expect(result.corrected).toEqual(data);
  });

  it('detects mismatched parity', () => {
    const data = [1, 0, 1, 1];
    const wrongParity = [0, 0, 0];

    const result = verifyAndCorrectData(data, wrongParity);
    expect(result.errorPosition).not.toBeNull();
  });
});

describe('checksums', () => {
  it('generateChecksum returns a sha256 hex digest', () => {
    expect(generateChecksum('hello')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifyChecksum accepts the correct checksum', () => {
    const checksum = generateChecksum('payload');
    expect(verifyChecksum('payload', checksum)).toBe(true);
  });

  it('verifyChecksum rejects an incorrect checksum', () => {
    const checksum = generateChecksum('payload');
    expect(verifyChecksum('tampered', checksum)).toBe(false);
  });
});

describe('createErrorCorrectionData', () => {
  it('creates correction metadata for a message', () => {
    const data = createErrorCorrectionData('msg-1', 'hello');

    expect(data.messageId).toBe('msg-1');
    expect(data.dataLength).toBeGreaterThan(0);
    expect(data.parityBits).toHaveLength(3);
    expect(data.correctionApplied).toBe(false);
    expect(data.checksumVerification).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('applyErrorCorrection', () => {
  it('returns the payload untouched when the checksum matches', () => {
    const data = createErrorCorrectionData('msg-1', 'hello');
    const result = applyErrorCorrection('hello', data);

    expect(result).toEqual({ corrected: 'hello', hadError: false });
  });

  it('attempts correction when the checksum fails', () => {
    const data = createErrorCorrectionData('msg-1', 'hello');
    const result = applyErrorCorrection('tampered', data);

    expect(result.hadError).toBe(true);
    expect(typeof result.corrected).toBe('string');
  });
});

describe('error rate', () => {
  it('returns 0 for zero messages', () => {
    expect(calculateErrorRate(0, 0)).toBe(0);
  });

  it('computes the error rate as a percentage', () => {
    expect(calculateErrorRate(100, 5)).toBe(5);
  });

  it('rounds to 4 decimal places', () => {
    expect(calculateErrorRate(3, 1)).toBe(33.3333);
  });

  it('isErrorRateAcceptable respects the max rate', () => {
    expect(isErrorRateAcceptable(0.0001)).toBe(true);
    expect(isErrorRateAcceptable(0.0002)).toBe(false);
    expect(isErrorRateAcceptable(1, 2)).toBe(true);
  });
});

describe('quantum-safe hash', () => {
  it('generates a stable 64-char hash', () => {
    const hash = generateQuantumSafeHash('data');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(generateQuantumSafeHash('data')).toBe(hash);
  });

  it('changes with the input', () => {
    expect(generateQuantumSafeHash('a')).not.toBe(generateQuantumSafeHash('b'));
  });

  it('verifyQuantumSafeHash round-trips', () => {
    const hash = generateQuantumSafeHash('payload');
    expect(verifyQuantumSafeHash('payload', hash)).toBe(true);
    expect(verifyQuantumSafeHash('other', hash)).toBe(false);
  });
});
