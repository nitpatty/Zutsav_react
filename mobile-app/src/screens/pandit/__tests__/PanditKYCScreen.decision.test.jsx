import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import PanditKYCScreen from '../PanditKYCScreen';

// Day 29 (issue E): on a narrow Android screen the green "Recommended" badge beside "Delete my uploaded document" ran off the right
// edge of the option card and was clipped. The title row now wraps and the text column may shrink (minWidth 0), so the badge drops
// under the title when there is no room. Jest has no layout engine, so the layout CONTRACT is asserted on the resolved styles of the
// real rendered nodes (the properties that decide wrapping/shrinking), plus the unchanged behaviour of the choice itself.

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/pandit/StickyActionBar', () => ({ useTabBarClearance: () => 0 }));

const pandit = (over = {}) => ({ kycStatus: 'approved', kycDocumentRetention: 'pending_decision', ...over });
const open = async (over) => {
  api.get.mockResolvedValue({ data: { pandit: pandit(over) } });
  render(<PanditKYCScreen />);
  await screen.findByText('Delete my uploaded document');
};
const style = (node) => StyleSheet.flatten(node.props.style) || {};
// Nearest HOST (native View/Text) ancestor — .parent alone can be a composite wrapper. Compare with === inside expect(...).toBe(true):
// a failed toBe on two React test instances would try to pretty-print their whole (circular) trees.
const hostParent = (node) => { let cur = node.parent; while (cur && typeof cur.type !== 'string') cur = cur.parent; return cur; };

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); Toast.show.mockClear(); });

describe('KYC "Recommended" badge stays inside its option card', () => {
  it('both choices and the badge are rendered with their descriptions', async () => {
    await open();
    expect(screen.getByText('Recommended')).toBeTruthy();
    expect(screen.getByText('Keep my document securely stored')).toBeTruthy();
    expect(screen.getByText('Permanently removes the file. Your KYC stays approved.')).toBeTruthy();
    expect(screen.getByText('Viewing it later will require OTP verification every time.')).toBeTruthy();
  });

  it('the title row wraps, the title can shrink, and the text column may shrink inside the card (no overflow at any width)', async () => {
    await open();
    const title = screen.getByText('Delete my uploaded document');
    const badge = screen.getByText('Recommended');
    const row = hostParent(title);                         // the row holding title + badge
    expect(row === hostParent(badge)).toBe(true);
    expect(style(row)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' });
    expect(style(title).flexShrink).toBe(1);               // a long title wraps its own text instead of pushing the badge out
    const column = hostParent(row);                        // the text column next to the radio icon
    expect(style(column)).toMatchObject({ flex: 1, minWidth: 0 });
  });

  it('the badge is part of the normal flow: not absolutely positioned, no fixed width/offset, and it never shrinks (so it is never cut in half)', async () => {
    await open();
    const s = style(screen.getByText('Recommended'));
    expect(s.position).toBeUndefined();
    ['left', 'right', 'top', 'bottom', 'width', 'marginLeft', 'marginRight'].forEach((k) => expect(s[k]).toBeUndefined());
    expect(s.flexShrink).toBe(0);
  });

  it('the badge does not share a node with the title or the description', async () => {
    await open();
    const badge = screen.getByText('Recommended');
    const title = screen.getByText('Delete my uploaded document');
    const hint = screen.getByText('Permanently removes the file. Your KYC stays approved.');
    expect(badge === title).toBe(false);
    expect(hostParent(badge) === hostParent(hint)).toBe(false);   // the description sits in the column, below the title row
    expect(hostParent(hint) === hostParent(hostParent(title))).toBe(true);
  });
});

describe('KYC retention choice is unchanged', () => {
  it('"Delete" is preselected and Confirm posts exactly { decision: "delete" }', async () => {
    await open();
    api.post.mockResolvedValue({ data: { success: true } });
    fireEvent.press(screen.getByText('Confirm Choice'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pandits/me/kyc/document-decision', { decision: 'delete' }));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('choosing "Keep" posts { decision: "keep" } and a failure shows the server message without changing anything else', async () => {
    await open();
    api.post.mockRejectedValue({ response: { data: { message: 'Not allowed right now' } } });
    fireEvent.press(screen.getByText('Keep my document securely stored'));
    fireEvent.press(screen.getByText('Confirm Choice'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pandits/me/kyc/document-decision', { decision: 'keep' }));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Not allowed right now' }));
  });
});
