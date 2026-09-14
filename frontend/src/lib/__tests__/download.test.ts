import { downloadTextFile } from '../download';

describe('downloadTextFile', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;

  beforeEach(() => {
    createObjectURL = jest.fn(() => 'blob:mock-url');
    revokeObjectURL = jest.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    document.body.innerHTML = '';
  });

  let clickedAnchor: HTMLAnchorElement | null = null;

  beforeEach(() => {
    clickedAnchor = null;
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchor = this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a blob with the file contents and default mime type', () => {
    downloadTextFile('notes.txt', 'hello world');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/plain');
    expect(blob.size).toBe('hello world'.length);

    expect(clickedAnchor).not.toBeNull();
    expect(clickedAnchor?.getAttribute('download')).toBe('notes.txt');
    expect(clickedAnchor?.href).toBe('blob:mock-url');
  });

  it('uses the provided mime type', () => {
    downloadTextFile('data.json', '{}', 'application/json');

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
  });

  it('removes the anchor and revokes the object URL after clicking', () => {
    downloadTextFile('notes.txt', 'hello');

    expect(document.querySelector('a')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
