import { absoluteShareUrl, copyText, shareLink } from './shareUtils';

const setNavigator = (props) => {
  Object.defineProperty(window, 'navigator', { value: props, configurable: true });
};
const originalNavigator = window.navigator;

afterEach(() => {
  Object.defineProperty(window, 'navigator', { value: originalNavigator, configurable: true });
  delete document.execCommand;
});

describe('absoluteShareUrl', () => {
  it('joins the server-issued path to the current origin', () => {
    expect(absoluteShareUrl('/share/invoice/abc', 'https://app.example.com')).toBe('https://app.example.com/share/invoice/abc');
  });
});

describe('copyText', () => {
  it('uses the async clipboard API when available', async () => {
    const writeText = jest.fn().mockResolvedValue();
    setNavigator({ clipboard: { writeText } });
    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when the clipboard API is missing or rejects', async () => {
    document.execCommand = jest.fn().mockReturnValue(true);
    setNavigator({});
    await expect(copyText('x')).resolves.toBe(true);

    setNavigator({ clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } });
    await expect(copyText('x')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelectorAll('textarea')).toHaveLength(0); // helper element cleaned up
  });

  it('reports failure when nothing can copy', async () => {
    document.execCommand = jest.fn().mockReturnValue(false);
    setNavigator({});
    await expect(copyText('x')).resolves.toBe(false);
  });
});

describe('shareLink', () => {
  const payload = { title: 'Invoice', text: 'Your invoice', url: 'https://app.example.com/share/invoice/t' };

  it('uses the native share sheet where supported', async () => {
    const share = jest.fn().mockResolvedValue();
    setNavigator({ share });
    await expect(shareLink(payload)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(payload);
  });

  it('treats a dismissed share sheet as a cancel, not an error', async () => {
    const writeText = jest.fn();
    setNavigator({ share: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })), clipboard: { writeText } });
    await expect(shareLink(payload)).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to copying when Web Share is unavailable or fails', async () => {
    const writeText = jest.fn().mockResolvedValue();
    setNavigator({ clipboard: { writeText } });
    await expect(shareLink(payload)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(payload.url);

    setNavigator({ share: jest.fn().mockRejectedValue(new Error('NotAllowedError')), clipboard: { writeText } });
    await expect(shareLink(payload)).resolves.toBe('copied');
  });
});
