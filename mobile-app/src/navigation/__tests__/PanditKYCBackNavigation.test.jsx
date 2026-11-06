import React from 'react';
import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import api from '../../api/axios';
import PanditNavigator from '../PanditNavigator';

// Pandit KYC Verification could not be left: back did not return to My Profile and reopening the Profile tab landed straight on KYC.
// Root cause: the dashboard KYC entries (alert card, "KYC" quick action) and the kyc_* notification handlers navigate with
// navigate('PanditProfileTab', { screen: 'PanditKYC' }). React Navigation 6 treats `screen` as the nested navigator's INITIAL route
// when that navigator has not rendered yet, so the Profile stack became [PanditKYC] with PanditProfileMain missing beneath it — back
// had nothing to pop to, and the Profile tab kept showing KYC. These tests render the REAL Pandit navigator with the REAL dashboard,
// profile and KYC screens (only the schedule calendar is stubbed) and drive the same entry points the device uses.

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(), put: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn() },
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../components/pandit/ScheduleCalendar', () => ({ __esModule: true, default: () => null }));

const PANDIT = {
  name: 'Test Pandit', phone: '9999999999', kycStatus: 'submitted',
  kycDocuments: { frontImage: 'front.jpg', backImage: 'back.jpg' },
};
const DASHBOARD = {
  profile: { kycStatus: 'submitted', isOnline: false },
  today: { bookings: [], earnings: 0 }, upcoming: { bookings: [] }, monthly: { earnings: 0 },
  pending: { referralRemarks: 0 }, performance: {},
};

// isRead:true so tapping one does not also fire the unrelated mark-as-read PATCH (keeps the "no write request" assertion meaningful).
const kycNotifications = ['kyc_approved', 'kyc_rejected', 'kyc_reupload'].map((type) => ({
  _id: `n-${type}`, type, title: `Title ${type}`, body: `Body ${type}`, isRead: true, createdAt: '2026-01-01T00:00:00.000Z',
}));

const ref = createNavigationContainerRef();
const profileTab = () => ref.getRootState().routes.find((r) => r.name === 'PanditProfileTab');
const profileStackRoutes = () => (profileTab().state?.routes || []).map((r) => r.name);
const activeTab = () => ref.getRootState().routes[ref.getRootState().index].name;
const activeProfileScreen = () => profileTab().state.routes[profileTab().state.index].name;
const writes = () => [...api.post.mock.calls, ...api.patch.mock.calls, ...api.delete.mock.calls, ...api.put.mock.calls];

const KYC_NOTE = 'Documents are under review. This usually takes 24–48 hours.';
const DASH_CARD = 'KYC under review — please wait';

const renderApp = async () => {
  render(<NavigationContainer ref={ref}><PanditNavigator /></NavigationContainer>);
  await screen.findByText(DASH_CARD);   // dashboard (kyc not approved → alert card) is the first screen
};
// This jest-expo setup has no BackHandler.mockPressBack, so capture the 'hardwareBackPress' listeners React Navigation registers and
// dispatch like Android does: newest listener first, stop at the first that returns true. `false` from all of them would exit the app.
let backListeners = [];
const pressHardwareBack = () => {
  let handled = false;
  act(() => {
    for (const fn of [...backListeners].reverse()) { if (fn()) { handled = true; break; } }
  });
  expect(handled).toBe(true);
};
// Inactive tabs stay mounted (e.g. the notification centre in the Home stack has its own back chevron), and the Profile tab is the last
// one in the tree — its only header with a back arrow is KYC's, so the last chevron is the KYC screen's.
const pressHeaderBack = () => fireEvent.press(screen.UNSAFE_getAllByProps({ name: 'chevron-back' }).slice(-1)[0]);
const openKycFromDashboardCard = () => fireEvent.press(screen.getByText(DASH_CARD));
const openProfileTab = () => fireEvent.press(screen.getByLabelText(/^Profile, tab/));
const openKycFromProfile = async () => {
  fireEvent.press(await screen.findByText('KYC Verification'));
  await screen.findByText(KYC_NOTE);
};

beforeEach(() => {
  backListeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, fn) => {
    if (event === 'hardwareBackPress') backListeners.push(fn);
    return { remove: () => { backListeners = backListeners.filter((l) => l !== fn); } };
  });
  Object.values(api).forEach((f) => f.mockReset && f.mockReset());
  api.get.mockImplementation(async (url) => {
    if (url === '/pandits/me/dashboard') return { data: DASHBOARD };
    if (url === '/pandits/me/payouts/stats') return { data: { stats: {} } };
    if (url === '/pandits/me') return { data: { pandit: PANDIT } };
    if (url.startsWith('/pandits/me/kyc/document/')) throw new Error('no image in tests');
    if (url.startsWith('/notifications?')) return { data: { notifications: kycNotifications } };
    return { data: {} };
  });
});

describe('Pandit KYC Verification back navigation', () => {
  describe('entered from My Profile', () => {
    it('header back returns to My Profile and KYC is gone from the stack', async () => {
      await renderApp();
      openProfileTab();
      await openKycFromProfile();
      expect(profileStackRoutes()).toEqual(['PanditProfileMain', 'PanditKYC']);

      pressHeaderBack();

      await waitFor(() => expect(activeProfileScreen()).toBe('PanditProfileMain'));
      expect(profileStackRoutes()).toEqual(['PanditProfileMain']);
      expect(await screen.findByText('KYC Verification')).toBeTruthy();   // the Profile menu row, not the KYC screen
      expect(screen.queryByText(KYC_NOTE)).toBeNull();
    });

    it('Android hardware back returns to My Profile', async () => {
      await renderApp();
      openProfileTab();
      await openKycFromProfile();

      pressHardwareBack();

      await waitFor(() => expect(activeProfileScreen()).toBe('PanditProfileMain'));
      expect(activeTab()).toBe('PanditProfileTab');
      expect(profileStackRoutes()).toEqual(['PanditProfileMain']);
    });

    it('repeated open/back cycles never accumulate duplicate KYC routes', async () => {
      await renderApp();
      openProfileTab();
      for (let i = 0; i < 3; i += 1) {
        await openKycFromProfile();
        expect(profileStackRoutes()).toEqual(['PanditProfileMain', 'PanditKYC']);
        if (i % 2 === 0) pressHeaderBack(); else pressHardwareBack();
        await waitFor(() => expect(profileStackRoutes()).toEqual(['PanditProfileMain']));
      }
    });
  });

  describe.each([
    ['the dashboard KYC alert card', openKycFromDashboardCard],
    ['the dashboard "KYC" quick action', () => fireEvent.press(screen.getByText('KYC'))],
  ])('entered from %s', (_label, enter) => {
    it('keeps My Profile beneath KYC, and header back returns to it', async () => {
      await renderApp();
      enter();
      await screen.findByText(KYC_NOTE);
      expect(activeTab()).toBe('PanditProfileTab');
      expect(profileStackRoutes()).toEqual(['PanditProfileMain', 'PanditKYC']);

      pressHeaderBack();

      await waitFor(() => expect(activeProfileScreen()).toBe('PanditProfileMain'));
      expect(profileStackRoutes()).toEqual(['PanditProfileMain']);
    });

    it('Android hardware back returns to My Profile', async () => {
      await renderApp();
      enter();
      await screen.findByText(KYC_NOTE);

      pressHardwareBack();

      await waitFor(() => expect(activeProfileScreen()).toBe('PanditProfileMain'));
      expect(activeTab()).toBe('PanditProfileTab');
    });
  });

  // The real notification centre and its real kyc_* handlers (PanditNotificationsScreen), reached the way the dashboard bell reaches it.
  it.each(['kyc_approved', 'kyc_rejected', 'kyc_reupload'])('a %s notification opens KYC with My Profile beneath it, and back returns to it', async (type) => {
    await renderApp();
    fireEvent.press(screen.getByLabelText('Notifications'));
    fireEvent.press((await screen.findAllByText(`Title ${type}`)).slice(-1)[0]);   // dashboard may echo it too; the centre mounts last
    await screen.findByText(KYC_NOTE);
    expect(activeTab()).toBe('PanditProfileTab');
    expect(profileStackRoutes()).toEqual(['PanditProfileMain', 'PanditKYC']);

    pressHeaderBack();

    await waitFor(() => expect(activeProfileScreen()).toBe('PanditProfileMain'));
    expect(profileStackRoutes()).toEqual(['PanditProfileMain']);
    expect(writes()).toEqual([]);
  });

  it('after backing out of KYC, leaving and reopening the Profile tab shows My Profile, not KYC', async () => {
    await renderApp();
    openKycFromDashboardCard();
    await screen.findByText(KYC_NOTE);
    pressHeaderBack();
    await waitFor(() => expect(activeProfileScreen()).toBe('PanditProfileMain'));

    act(() => { ref.navigate('PanditHomeTab'); });
    await screen.findByText(DASH_CARD);
    expect(activeTab()).toBe('PanditHomeTab');
    openProfileTab();

    await waitFor(() => expect(activeTab()).toBe('PanditProfileTab'));
    expect(activeProfileScreen()).toBe('PanditProfileMain');
    expect(profileStackRoutes()).toEqual(['PanditProfileMain']);
  });

  it('the dashboard KYC card can be used repeatedly without duplicating routes', async () => {
    await renderApp();
    for (let i = 0; i < 3; i += 1) {
      openKycFromDashboardCard();
      await screen.findByText(KYC_NOTE);
      expect(profileStackRoutes()).toEqual(['PanditProfileMain', 'PanditKYC']);
      pressHeaderBack();
      await waitFor(() => expect(profileStackRoutes()).toEqual(['PanditProfileMain']));
      act(() => { ref.navigate('PanditHomeTab'); });
      await screen.findByText(DASH_CARD);
    }
  });

  it('keeps the Submitted state and document sections intact and sends no write request while navigating', async () => {
    await renderApp();
    openKycFromDashboardCard();
    expect(await screen.findByText(KYC_NOTE)).toBeTruthy();
    expect(screen.getByText('Submitted Documents')).toBeTruthy();
    expect(screen.getByText('Front of ID Card')).toBeTruthy();
    expect(screen.getByText('Back of ID Card')).toBeTruthy();
    // previews are still fetched through the authenticated document endpoint, exactly as before
    await waitFor(() => {
      const urls = api.get.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/pandits/me/kyc/document/frontImage');
      expect(urls).toContain('/pandits/me/kyc/document/backImage');
    });

    pressHeaderBack();
    await waitFor(() => expect(activeProfileScreen()).toBe('PanditProfileMain'));
    expect(writes()).toEqual([]);
  });
});
