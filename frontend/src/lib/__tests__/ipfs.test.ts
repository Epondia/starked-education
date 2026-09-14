import axios from 'axios';
import { IpfsClient } from '../ipfs';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('IpfsClient static helpers', () => {
  describe('formatGatewayUrl', () => {
    it('appends the CID to the default gateway', () => {
      expect(IpfsClient.formatGatewayUrl('QmCid123')).toBe(
        'https://ipfs.io/ipfs/QmCid123',
      );
    });

    it('appends the CID to a custom gateway', () => {
      expect(IpfsClient.formatGatewayUrl('QmCid123', 'https://gw.example/')).toBe(
        'https://gw.example/QmCid123',
      );
    });
  });

  describe('extractHashFromGatewayUrl', () => {
    it('extracts the CID from a gateway URL', () => {
      expect(
        IpfsClient.extractHashFromGatewayUrl('https://ipfs.io/ipfs/QmCid123'),
      ).toBe('QmCid123');
    });

    it('returns null when the URL has no /ipfs/ segment', () => {
      expect(IpfsClient.extractHashFromGatewayUrl('https://example.com/foo')).toBeNull();
    });
  });

  describe('isValidCid', () => {
    it('accepts a plain CID-like hash', () => {
      expect(IpfsClient.isValidCid('Qm'.padEnd(46, 'a'))).toBe(true);
    });

    it('accepts a CID embedded in a gateway URL', () => {
      expect(
        IpfsClient.isValidCid('https://ipfs.io/ipfs/' + 'Qm'.padEnd(46, 'a')),
      ).toBe(true);
    });

    it('rejects empty, non-string, and malformed values', () => {
      expect(IpfsClient.isValidCid('')).toBe(false);
      expect(IpfsClient.isValidCid(null as unknown as string)).toBe(false);
      expect(IpfsClient.isValidCid('short')).toBe(false);
      expect(IpfsClient.isValidCid('not-a-valid-cid-123')).toBe(false);
    });
  });
});

describe('IpfsClient error handling', () => {
  it('wraps IPFS API errors with operation details', async () => {
    mockedAxios.get.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          isIpfsError: true,
          message: 'Invalid CID',
          operation: 'getContent',
          details: { reason: 'bad hash' },
        },
      },
    });

    const client = new IpfsClient('http://test/api/content');
    await expect(client.getContent('bad-cid')).rejects.toMatchObject({
      message: 'Invalid CID',
      operation: 'getContent',
      details: { reason: 'bad hash' },
      isIpfsError: true,
    });
  });

  it('wraps non-IPFS API errors with the status code', async () => {
    mockedAxios.get.mockRejectedValueOnce({
      response: { status: 500, data: { message: 'Server exploded' } },
    });

    const client = new IpfsClient('http://test/api/content');
    await expect(client.getContent('cid')).rejects.toMatchObject({
      message: 'Server exploded',
      details: { status: 500 },
    });
  });

  it('wraps network errors', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const client = new IpfsClient('http://test/api/content');
    await expect(client.getContent('cid')).rejects.toMatchObject({
      message: 'Network error occurred',
    });
  });

  it('includes the auth token in headers when set', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { data: { byteLength: 0 } } });

    const client = new IpfsClient('http://test/api/content');
    client.setAuthToken('token-123');
    await client.getContent('cid');

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/content/cid?'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
  });
});
