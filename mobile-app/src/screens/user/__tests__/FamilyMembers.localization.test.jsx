import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { RELATIONSHIP_VALUES, relationshipLabel } from '../../../utils/familyLabels';
import FamilyMembersScreen from '../FamilyMembersScreen';
import FamilyMemberFormScreen from '../FamilyMemberFormScreen';

// F-08 Phase 6: Family Members. Only the labels are translated. The relationship VALUE ('Father', …) is what the API stores
// and receives, ids / names / payloads / endpoints / navigation params are unchanged, and a language change neither
// refetches the list nor disturbs a form that is being filled in.

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text, View } = require('react-native');
  return { __esModule: true, default: ({ title, right }) => <View><Text>{`HEADER:${title}`}</Text>{right}</View> };
});
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));
let focusHandler;
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn((event, handler) => { if (event === 'focus') focusHandler = handler; return jest.fn(); }) };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const hi = getTranslator('hi');
const ta = getTranslator('ta');
const en = getTranslator('en');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

const members = () => [
  { _id: 'm1', name: 'Ramesh Kumar', relationship: 'Father', dateOfBirth: '1960-05-10T00:00:00.000Z' },
  { _id: 'm2', name: 'Sita Devi', relationship: 'Mother' },
  { _id: 'm3', name: 'Mohan Lal', relationship: 'Cousin' },        // a value outside the list (older / free-form data)
];
const serve = (list = members()) => api.get.mockResolvedValue({ data: { familyMembers: list } });
const httpError = (message) => ({ response: { status: 400, data: message ? { message } : {} } });

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); api.patch.mockReset(); api.delete.mockReset();
  Toast.show.mockClear(); mockNav.navigate.mockClear(); mockNav.goBack.mockClear(); mockNav.addListener.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe('relationship labels', () => {
  it('English shows the stored value unchanged; every known value has a different Hindi and Tamil label; unknown values pass through', () => {
    RELATIONSHIP_VALUES.forEach((v) => {
      expect(relationshipLabel(v, en)).toBe(v);
      expect(relationshipLabel(v, hi)).not.toBe(v);
      expect(relationshipLabel(v, ta)).not.toBe(v);
    });
    expect(relationshipLabel('Cousin', hi)).toBe('Cousin');
    expect(relationshipLabel('constructor', hi)).toBe('constructor');
    expect(relationshipLabel(undefined, hi)).toBeUndefined();
  });

  it('the option list is exactly the values the form has always offered', () => {
    expect(RELATIONSHIP_VALUES).toEqual(['Father', 'Mother', 'Son', 'Daughter', 'Spouse', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Other']);
  });
});

describe('FamilyMembersScreen localization', () => {
  it('English is unchanged', async () => {
    serve();
    render(<FamilyMembersScreen />);
    expect(await screen.findByText('Ramesh Kumar')).toBeTruthy();
    expect(screen.getByText('HEADER:Family Members')).toBeTruthy();
    expect(screen.getByText('Manage your family members for pooja bookings and spiritual services.')).toBeTruthy();
    expect(screen.getByText('Father')).toBeTruthy();
    expect(screen.getByText('Add Another Member')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/users/family-members');
  });

  it('Hindi: title, subtitle, relationship labels, actions and accessibility labels are translated; names and unknown relationships are not', async () => {
    await setLang('hi');
    serve();
    render(<FamilyMembersScreen />);
    expect(await screen.findByText('Ramesh Kumar')).toBeTruthy();
    expect(screen.getByText(`HEADER:${hi('profile.familyMembers')}`)).toBeTruthy();
    expect(screen.getByText(hi('family.subtitle'))).toBeTruthy();
    expect(screen.getByText(hi('family.relFather'))).toBeTruthy();
    expect(screen.getByText(hi('family.relMother'))).toBeTruthy();
    expect(screen.getByText('Cousin')).toBeTruthy();
    expect(screen.getByText(hi('family.addAnother'))).toBeTruthy();
    expect(screen.getByLabelText(hi('family.editLabel', { name: 'Ramesh Kumar' }))).toBeTruthy();
    expect(screen.getByLabelText(hi('family.deleteLabel', { name: 'Sita Devi' }))).toBeTruthy();
  });

  it('Tamil renders too, and a switch re-labels the list WITHOUT refetching it', async () => {
    serve();
    render(<FamilyMembersScreen />);
    await screen.findByText('Ramesh Kumar');
    expect(api.get).toHaveBeenCalledTimes(1);
    await setLang('ta');
    expect(screen.getByText(ta('family.relFather'))).toBeTruthy();
    expect(screen.getByText(`HEADER:${ta('profile.familyMembers')}`)).toBeTruthy();
    expect(screen.queryByText('Father')).toBeNull();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('edit and add navigate with the same params (the stored member, with its original relationship value)', async () => {
    await setLang('hi');
    serve();
    render(<FamilyMembersScreen />);
    await screen.findByText('Ramesh Kumar');
    fireEvent.press(screen.getByLabelText(hi('family.editLabel', { name: 'Ramesh Kumar' })));
    expect(mockNav.navigate).toHaveBeenCalledWith('FamilyMemberForm', { member: expect.objectContaining({ _id: 'm1', name: 'Ramesh Kumar', relationship: 'Father' }) });
    fireEvent.press(screen.getByText(hi('family.addAnother')));
    expect(mockNav.navigate).toHaveBeenLastCalledWith('FamilyMemberForm', { member: null });
  });

  it('delete: translated confirmation (relationship shown in the user\'s language), unchanged endpoint, translated success', async () => {
    await setLang('hi');
    serve();
    api.delete.mockResolvedValue({ data: { success: true } });
    render(<FamilyMembersScreen />);
    await screen.findByText('Ramesh Kumar');
    fireEvent.press(screen.getByLabelText(hi('family.deleteLabel', { name: 'Ramesh Kumar' })));
    const [title, message, buttons] = Alert.alert.mock.calls[0];
    expect(title).toBe(hi('family.deleteTitle'));
    expect(message).toBe(hi('family.deleteConfirm', { name: 'Ramesh Kumar', relationship: hi('family.relFather') }));
    expect(buttons.map((b) => b.text)).toEqual([hi('common.cancel'), hi('address.delete')]);
    await act(async () => { await buttons[1].onPress(); });
    expect(api.delete).toHaveBeenCalledWith('/users/family-members/m1');
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi('family.removed') });
    expect(screen.queryByText('Ramesh Kumar')).toBeNull();
    expect(screen.getByText('Sita Devi')).toBeTruthy();                       // only that member was removed
  });

  it('delete failure: the server message is shown as received, otherwise the translated fallback; the member stays', async () => {
    await setLang('hi');
    serve();
    render(<FamilyMembersScreen />);
    await screen.findByText('Ramesh Kumar');
    fireEvent.press(screen.getByLabelText(hi('family.deleteLabel', { name: 'Ramesh Kumar' })));
    const confirm = Alert.alert.mock.calls[0][2][1];
    api.delete.mockRejectedValueOnce(httpError('Member is linked to a booking'));
    await act(async () => { await confirm.onPress(); });
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: 'Member is linked to a booking' });
    api.delete.mockRejectedValueOnce(httpError());
    await act(async () => { await confirm.onPress(); });
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('family.deleteFailed') });
    expect(screen.getByText('Ramesh Kumar')).toBeTruthy();
  });

  it('empty state is translated and leads to the same form; loading text and load error are translated', async () => {
    await setLang('hi');
    let release;
    api.get.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ data: { familyMembers: [] } }); }));
    render(<FamilyMembersScreen />);
    expect(screen.getByText(hi('family.loading'))).toBeTruthy();
    await act(async () => { release(); });
    expect(await screen.findByText(hi('family.emptyTitle'))).toBeTruthy();
    expect(screen.getByText(hi('family.emptySub'))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('family.addTitle')));
    expect(mockNav.navigate).toHaveBeenCalledWith('FamilyMemberForm', { member: null });
  });

  it('a load failure shows the translated message; coming back (focus) still refetches', async () => {
    await setLang('hi');
    api.get.mockRejectedValueOnce(new Error('offline'));
    render(<FamilyMembersScreen />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('family.loadFailed') }));
    serve();
    await act(async () => { focusHandler(); });
    expect(await screen.findByText('Ramesh Kumar')).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe('FamilyMemberFormScreen localization', () => {
  const navigation = { goBack: jest.fn() };
  const open = (member) => render(<FamilyMemberFormScreen route={{ params: { member } }} navigation={navigation} />);
  beforeEach(() => navigation.goBack.mockClear());

  it('English is unchanged', () => {
    open(null);
    expect(screen.getByText('HEADER:Add Family Member')).toBeTruthy();
    expect(screen.getByText('Full Name *')).toBeTruthy();
    expect(screen.getByText('Relationship *')).toBeTruthy();
    expect(screen.getByText('Date of Birth (optional)')).toBeTruthy();
    expect(screen.getByText('Select date of birth')).toBeTruthy();
    RELATIONSHIP_VALUES.forEach((v) => expect(screen.getByText(v)).toBeTruthy());
    expect(screen.getByText('Add Member')).toBeTruthy();
  });

  it('Hindi add: translated labels and chips; the request carries the English relationship VALUE and the typed name', async () => {
    await setLang('hi');
    api.post.mockResolvedValue({ data: { success: true } });
    open(null);
    expect(screen.getByText(`HEADER:${hi('family.addTitle')}`)).toBeTruthy();
    expect(screen.getByText(hi('profile.fullNameRequired'))).toBeTruthy();
    expect(screen.getByText(hi('family.relationshipLabel'))).toBeTruthy();
    expect(screen.getByText(hi('family.dobPlaceholder'))).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText(hi('family.namePlaceholder')), '  आशा देवी  ');
    fireEvent.press(screen.getByText(hi('family.relDaughter')));
    fireEvent.press(screen.getByText(hi('family.addBtn')));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/users/family-members', { name: 'आशा देवी', relationship: 'Daughter', dateOfBirth: null });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi('family.added') });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('edit (Tamil): values are pre-filled, the update goes to the same member endpoint with the same payload shape', async () => {
    await setLang('ta');
    api.patch.mockResolvedValue({ data: { success: true } });
    open({ _id: 'm1', name: 'Ramesh Kumar', relationship: 'Father', dateOfBirth: '1960-05-10T00:00:00.000Z' });
    expect(screen.getByText(`HEADER:${ta('family.editTitle')}`)).toBeTruthy();
    expect(screen.getByDisplayValue('Ramesh Kumar')).toBeTruthy();
    fireEvent.press(screen.getByText(ta('family.updateBtn')));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith('/users/family-members/m1', { name: 'Ramesh Kumar', relationship: 'Father', dateOfBirth: '1960-05-10T00:00:00.000Z' });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: ta('family.updated') });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('validation: translated messages, no request; they re-translate on a language change and clear while typing', async () => {
    await setLang('hi');
    open(null);
    fireEvent.press(screen.getByText(hi('family.addBtn')));
    expect(screen.getByText(hi('family.nameRequired'))).toBeTruthy();
    expect(screen.getByText(hi('family.relationshipRequired'))).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
    await setLang('ta');
    expect(screen.getByText(ta('family.nameRequired'))).toBeTruthy();
    expect(screen.queryByText(hi('family.nameRequired'))).toBeNull();
    fireEvent.changeText(screen.getByPlaceholderText(ta('family.namePlaceholder')), 'Asha');
    expect(screen.queryByText(ta('family.nameRequired'))).toBeNull();
    expect(screen.getByText(ta('family.relationshipRequired'))).toBeTruthy();
  });

  it('a language change while filling the form keeps the typed name, the chosen relationship and the submitted values', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    open(null);
    fireEvent.changeText(screen.getByPlaceholderText('Enter full name'), 'Asha Devi');
    fireEvent.press(screen.getByText('Spouse'));
    await setLang('hi');
    expect(screen.getByDisplayValue('Asha Devi')).toBeTruthy();
    fireEvent.press(screen.getByText(hi('family.addBtn')));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/users/family-members', { name: 'Asha Devi', relationship: 'Spouse', dateOfBirth: null });
  });

  it('save failure: the server message is shown as received, otherwise the translated fallback; the form stays', async () => {
    await setLang('hi');
    open(null);
    fireEvent.changeText(screen.getByPlaceholderText(hi('family.namePlaceholder')), 'Asha');
    fireEvent.press(screen.getByText(hi('family.relSister')));
    api.post.mockRejectedValueOnce(httpError('Duplicate member'));
    fireEvent.press(screen.getByText(hi('family.addBtn')));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Duplicate member' }));
    api.post.mockRejectedValueOnce(httpError());
    fireEvent.press(screen.getByText(hi('family.addBtn')));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('family.saveFailed') }));
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Asha')).toBeTruthy();
  });

  it('clearing the date of birth keeps working through its accessibility label', async () => {
    await setLang('hi');
    api.patch.mockResolvedValue({ data: { success: true } });
    open({ _id: 'm1', name: 'Ramesh Kumar', relationship: 'Father', dateOfBirth: '1960-05-10T00:00:00.000Z' });
    fireEvent.press(screen.getByLabelText(hi('family.clearDob')));
    expect(screen.getByText(hi('family.dobPlaceholder'))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('family.updateBtn')));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/family-members/m1', { name: 'Ramesh Kumar', relationship: 'Father', dateOfBirth: null }));
  });
});
