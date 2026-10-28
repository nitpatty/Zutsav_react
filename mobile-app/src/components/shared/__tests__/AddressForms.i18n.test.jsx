import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import AddressPicker from '../AddressPicker';
import useAddresses from '../../../hooks/useAddresses';
import { useLanguageStore } from '../../../i18n/languageStore';
import { DICTIONARIES } from '../../../i18n/locales';

// Address Book / address picker / add-edit sheet in a non-English language. The point of every test: the words change,
// the data does not (labels sent to the API, coordinate pairs, request shapes).
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../hooks/useAddresses', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../../services/geocodingService', () => ({ reverseGeocodeLocation: jest.fn(), autocompletePlaces: jest.fn(), clearGeocodingCache: jest.fn() }));
jest.mock('../../../hooks/usePincodeLookup', () => ({ __esModule: true, default: () => ({ loading: false, data: null, error: null }) }));
jest.mock('../LocationSearch', () => ({ __esModule: true, default: () => null }));
jest.mock('../MapPicker', () => ({ __esModule: true, default: () => null }));

const hi = DICTIONARIES.hi;
const ta = DICTIONARIES.ta;
const MUMBAI = { latitude: 19.076, longitude: 72.8777 };
const HOME = { _id: 'a1', label: 'Home', isDefault: true, address: '12 MG Road, Fort', pincode: '400001', state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City', ...MUMBAI };
const OFFICE = { _id: 'a2', label: 'Office', isDefault: false, address: 'Office Park 7', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' };
const CUSTOM = { _id: 'a3', label: "Mom's flat", isDefault: false, address: 'Flat 4B', pincode: '110001', state: 'Delhi', city: 'New Delhi', district: 'Central Delhi' };

let api;
const mockAddresses = (addresses = []) => {
  api = { addresses, loading: false, addAddress: jest.fn().mockResolvedValue(addresses), updateAddress: jest.fn().mockResolvedValue(addresses), deleteAddress: jest.fn().mockResolvedValue(addresses) };
  useAddresses.mockReturnValue(api);
};
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const iconButton = (name, index = 0) => screen.UNSAFE_getAllByType(Ionicons).filter((i) => i.props.name === name)[index];

beforeEach(() => {
  Toast.show.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Address Book (manager mode)', () => {
  const manager = () => render(<AddressPicker mode="manager" value={{}} onChange={() => {}} />);

  it('English is unchanged', () => {
    mockAddresses([]);
    manager();
    expect(screen.getByText('No saved addresses yet')).toBeTruthy();
    expect(screen.getByText('Add an address to speed up future bookings')).toBeTruthy();
    expect(screen.getByText('Add New Address')).toBeTruthy();
  });

  it('renders the empty state and the add button in Hindi', async () => {
    await setLang('hi');
    mockAddresses([]);
    manager();
    expect(screen.getByText(hi.address.emptyTitle)).toBeTruthy();
    expect(screen.getByText(hi.address.emptyHint)).toBeTruthy();
    expect(screen.getByText(hi.address.addNew)).toBeTruthy();
  });

  it('shows the three standard labels translated, a custom label as typed, and the Default badge — addresses themselves untouched', async () => {
    await setLang('hi');
    mockAddresses([HOME, OFFICE, CUSTOM]);
    manager();
    expect(screen.getByText(hi.address.labelHome)).toBeTruthy();
    expect(screen.getByText(hi.address.labelOffice)).toBeTruthy();
    expect(screen.getByText("Mom's flat")).toBeTruthy();            // user-entered text is never translated
    expect(screen.getByText(hi.address.defaultBadge)).toBeTruthy();
    expect(screen.getByText('12 MG Road, Fort')).toBeTruthy();       // address text, city/state/pincode are data
    expect(screen.getByText('Mumbai, Maharashtra, 400001')).toBeTruthy();
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('switching language re-renders the cards without refetching or touching the data', async () => {
    mockAddresses([HOME]);
    manager();
    expect(screen.getByText('Home')).toBeTruthy();
    await setLang('ta');
    expect(screen.getByText(ta.address.labelHome)).toBeTruthy();
    expect(screen.getByText(ta.address.defaultBadge)).toBeTruthy();
    expect(api.addAddress).not.toHaveBeenCalled();
    expect(api.updateAddress).not.toHaveBeenCalled();
    expect(api.deleteAddress).not.toHaveBeenCalled();
  });

  it('delete confirmation is localized, names the address by its translated label, and still deletes by id', async () => {
    await setLang('hi');
    mockAddresses([HOME]);
    manager();
    fireEvent.press(iconButton('trash-outline'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = Alert.alert.mock.calls[0];
    expect(title).toBe(hi.address.deleteTitle);
    expect(message).toBe(hi.address.deleteConfirm.replace('{{label}}', hi.address.labelHome));
    expect(buttons.map((b) => b.text)).toEqual([hi.common.cancel, hi.address.delete]);
    await act(async () => { await buttons[1].onPress(); });
    expect(api.deleteAddress).toHaveBeenCalledWith('a1');
  });

  it('a custom label appears verbatim in the delete confirmation', async () => {
    await setLang('hi');
    mockAddresses([CUSTOM]);
    manager();
    fireEvent.press(iconButton('trash-outline'));
    expect(Alert.alert.mock.calls[0][1]).toBe(hi.address.deleteConfirm.replace('{{label}}', "Mom's flat"));
  });

  it('a failed delete shows the localized message', async () => {
    await setLang('hi');
    mockAddresses([HOME]);
    api.deleteAddress.mockRejectedValue(new Error('boom'));
    manager();
    fireEvent.press(iconButton('trash-outline'));
    await act(async () => { await Alert.alert.mock.calls[0][2][1].onPress(); });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.address.deleteFailed });
  });
});

describe('add / edit sheet', () => {
  const openAddSheet = () => {
    render(<AddressPicker mode="manager" value={{}} onChange={() => {}} />);
    fireEvent.press(screen.getByText(DICTIONARIES[useLanguageStore.getState().language]?.address?.addNew || 'Add New Address'));
  };

  it('English is unchanged', () => {
    mockAddresses([]);
    openAddSheet();
    expect(screen.getByText('Add Address')).toBeTruthy();
    ['Home', 'Office', 'Other', 'Search Location', 'Address *', 'Pincode *', 'City', 'District', 'State', 'Set as default address', 'Save Address']
      .forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    expect(screen.getByPlaceholderText('House no., street, area…')).toBeTruthy();
  });

  it('renders the add sheet in Hindi (title, label pills, fields, placeholders, buttons)', async () => {
    await setLang('hi');
    mockAddresses([]);
    openAddSheet();
    expect(screen.getByText(hi.address.add)).toBeTruthy();
    [hi.address.labelHome, hi.address.labelOffice, hi.address.labelOther, hi.location.searchLabel, hi.address.addressRequired,
      hi.address.pincodeRequired, hi.address.city, hi.address.district, hi.address.state, hi.address.setDefault, hi.address.save]
      .forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    expect(screen.getByPlaceholderText(hi.address.placeholder)).toBeTruthy();
    expect(screen.getAllByPlaceholderText(hi.address.city).length).toBeGreaterThan(0);
  });

  it('the label sent to the API stays the English value whichever language the pills are shown in', async () => {
    await setLang('hi');
    mockAddresses([]);
    openAddSheet();
    fireEvent.press(screen.getByText(hi.address.labelOffice));
    fireEvent.changeText(screen.getByPlaceholderText(hi.address.placeholder), 'Office Park 7');
    fireEvent.changeText(screen.getByPlaceholderText(hi.location.pincodePlaceholder), '560001');
    fireEvent.press(screen.getByText(hi.address.setDefault));
    await act(async () => { fireEvent.press(screen.getByText(hi.address.save)); });
    await waitFor(() => expect(api.addAddress).toHaveBeenCalledTimes(1));
    expect(api.addAddress).toHaveBeenCalledWith({
      label: 'Office', address: 'Office Park 7', pincode: '560001', state: '', city: '', district: '', isDefault: true,
      latitude: null, longitude: null,
    });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi.address.added });
  });

  it('the request is identical in English and Hindi (same inputs → same payload)', async () => {
    const run = async () => {
      mockAddresses([]);
      const { unmount } = render(<AddressPicker mode="manager" value={{}} onChange={() => {}} />);
      const t = DICTIONARIES[useLanguageStore.getState().language];
      fireEvent.press(screen.getByText(t.address.addNew));
      fireEvent.press(screen.getByText(t.address.labelOther));
      fireEvent.changeText(screen.getByPlaceholderText(t.address.placeholder), '5 Park Street');
      fireEvent.changeText(screen.getByPlaceholderText(t.location.pincodePlaceholder), '700016');
      await act(async () => { fireEvent.press(screen.getByText(t.address.save)); });
      await waitFor(() => expect(api.addAddress).toHaveBeenCalled());
      const payload = api.addAddress.mock.calls[0][0];
      unmount();
      return payload;
    };
    const english = await run();
    await setLang('hi');
    const hindi = await run();
    expect(hindi).toEqual(english);
    expect(hindi.label).toBe('Other');
  });

  it('editing keeps the saved coordinate pair; a save failure shows the server message, else the localized fallback', async () => {
    await setLang('hi');
    mockAddresses([HOME]);
    render(<AddressPicker mode="manager" value={{}} onChange={() => {}} />);
    fireEvent.press(iconButton('pencil-outline'));
    expect(screen.getByText(hi.address.edit)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText(hi.address.save)); });
    await waitFor(() => expect(api.updateAddress).toHaveBeenCalledTimes(1));
    expect(api.updateAddress).toHaveBeenCalledWith('a1', expect.objectContaining({ label: 'Home', ...MUMBAI }));

    // (a successful save closes the sheet, so it is reopened for each failure case)
    fireEvent.press(iconButton('pencil-outline'));
    api.updateAddress.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Pincode not serviceable' } } });
    await act(async () => { fireEvent.press(screen.getByText(hi.address.save)); });
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Pincode not serviceable' }));
    api.updateAddress.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { fireEvent.press(screen.getByText(hi.address.save)); });
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.address.saveFailed }));
  });

  it('changing the language while the sheet is open keeps what the user typed', async () => {
    mockAddresses([]);
    openAddSheet();
    fireEvent.changeText(screen.getByPlaceholderText('House no., street, area…'), 'Typed before switching');
    fireEvent.changeText(screen.getByPlaceholderText('Enter 6-digit pincode'), '560001');
    await setLang('hi');
    expect(screen.getByDisplayValue('Typed before switching')).toBeTruthy();
    expect(screen.getByDisplayValue('560001')).toBeTruthy();
    expect(screen.getByText(hi.address.add)).toBeTruthy();
  });
});

describe('address picker used in booking (inline new address)', () => {
  let latest;
  function Harness({ initial }) {
    const [value, setValue] = useState(initial);
    latest = value;
    return <AddressPicker mode="picker" allowInlineNew value={value} onChange={(f) => setValue((p) => ({ ...p, ...f }))} />;
  }
  const mountInline = (initial = { address: '12 MG Road, Fort', pincode: '400001', state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City', ...MUMBAI }) => {
    mockAddresses([]);
    return render(<Harness initial={initial} />);
  };

  it('English is unchanged', () => {
    mountInline();
    ['Search Location', 'Address *', 'Pincode *', 'City', 'State', 'Save this address for future bookings'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
  });

  it('renders in Hindi and keeps pin label numbers exactly', async () => {
    await setLang('hi');
    mountInline();
    expect(screen.getByText(hi.location.searchLabel)).toBeTruthy();
    expect(screen.getByText(hi.address.addressRequired)).toBeTruthy();
    expect(screen.getByText(hi.address.saveForLater)).toBeTruthy();
    expect(screen.getByText(`📍 19.07600, 72.87770 · ${hi.location.pinSaved}`)).toBeTruthy();
  });

  it('a manual edit clears the pin pair and shows the stale-pin notice in the active language', async () => {
    await setLang('hi');
    mountInline();
    fireEvent.changeText(screen.getByPlaceholderText(hi.address.placeholder), '14 MG Road, Fort');
    expect(latest.latitude).toBeNull();
    expect(latest.longitude).toBeNull();
    expect(screen.getByTestId('stale-pin-notice').props.children).toBe(hi.location.stalePinNotice);
  });

  it('saving the typed address for later sends the English label and the coordinate pair (or nulls) unchanged', async () => {
    await setLang('hi');
    mountInline();
    fireEvent.press(screen.getByText(hi.address.saveForLater));
    fireEvent.press(screen.getByText(hi.address.labelOffice));
    await act(async () => { fireEvent.press(screen.getByText(hi.address.save)); });
    await waitFor(() => expect(api.addAddress).toHaveBeenCalledTimes(1));
    expect(api.addAddress).toHaveBeenCalledWith({
      label: 'Office', address: '12 MG Road, Fort', pincode: '400001', state: 'Maharashtra', city: 'Mumbai', district: 'Mumbai City',
      latitude: 19.076, longitude: 72.8777, isDefault: false,
    });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi.address.saved });
  });

  it('"enter address and pincode first" is localized and nothing is sent', async () => {
    await setLang('hi');
    mountInline({ address: '', pincode: '', state: '', city: '', district: '' });
    fireEvent.press(screen.getByText(hi.address.saveForLater));
    await act(async () => { fireEvent.press(screen.getByText(hi.address.save)); });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.address.enterAddressFirst });
    expect(api.addAddress).not.toHaveBeenCalled();
  });
});
