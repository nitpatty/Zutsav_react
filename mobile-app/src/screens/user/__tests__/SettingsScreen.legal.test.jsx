import fs from 'fs';
import path from 'path';
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useAuthStore } from '../../../store/authStore';
import SettingsScreen from '../SettingsScreen';
import PanditSettingsScreen from '../../pandit/PanditSettingsScreen';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

const src = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...p), 'utf8');

beforeEach(() => { jest.clearAllMocks(); });

describe.each([
  ['User Settings', SettingsScreen],
  ['Pandit Settings', PanditSettingsScreen],
])('%s — Legal & Resources entry', (_name, Screen) => {
  it('has a Legal & Resources row that opens the screen', () => {
    render(<Screen />);
    fireEvent.press(screen.getByLabelText('Legal & Resources'));
    expect(mockNav.navigate).toHaveBeenCalledWith('LegalResources');
  });

  it('keeps the existing account rows working', () => {
    render(<Screen />);
    fireEvent.press(screen.getByText('Change Password'));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('ChangePassword');
    fireEvent.press(screen.getByText('Notifications'));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('Notifications');
    fireEvent.press(screen.getByText('Delete Account'));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('DeleteAccount');
  });

  it('keeps theme choices and Logout confirmation', () => {
    const logout = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useAuthStore.setState({ logout });
    render(<Screen />);
    expect(screen.getByText('Dark Mode')).toBeTruthy();
    fireEvent.press(screen.getByText('Logout'));
    expect(alertSpy).toHaveBeenCalledWith('Logout?', expect.any(String), expect.any(Array));
    alertSpy.mock.calls[0][2].find((b) => b.text === 'Logout').onPress();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('makes no network request just by opening Settings', () => {
    const api = require('../../../api/axios').default;
    const spy = jest.spyOn(api, 'get');
    render(<Screen />);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('navigation wiring and access boundaries (static guards)', () => {
  it('User and Pandit navigators both register LegalResources and LegalDocument', () => {
    for (const file of ['navigation/UserNavigator.jsx', 'navigation/PanditNavigator.jsx']) {
      const text = src(file);
      expect(text).toMatch(/name="LegalResources"/);
      expect(text).toMatch(/name="LegalDocument"/);
    }
  });

  it('the unapproved-Pandit gate navigator is unchanged (no Legal routes added to it)', () => {
    const gate = src('navigation/PanditGateNavigator.jsx');
    expect(gate).not.toMatch(/LegalResources|LegalDocument/);
  });

  it('legal screens only reference the public document endpoints (no KYC, admin or upload paths)', () => {
    const files = ['screens/user/LegalResourcesScreen.jsx', 'screens/user/LegalDocumentScreen.jsx', 'services/legalResourcesService.js', 'utils/legalResources.js'];
    for (const f of files) {
      const text = src(f);
      expect(text).not.toMatch(/kyc|govtid|\/uploads\/|\/admin\//i);
      expect(text).not.toMatch(/console\.(log|info|warn|error)/);
    }
  });
});
