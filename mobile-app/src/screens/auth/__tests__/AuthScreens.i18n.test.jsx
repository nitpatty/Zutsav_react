import React from 'react';
import { TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useLanguageStore } from '../../../i18n/languageStore';
import { DICTIONARIES } from '../../../i18n/locales';
import LoginScreen from '../LoginScreen';
import RegisterScreen from '../RegisterScreen';
import VerificationChannelScreen from '../VerificationChannelScreen';
import OTPScreen from '../OTPScreen';
import SetPasswordScreen from '../SetPasswordScreen';

// Real screens + real i18n; only native/visual modules and the transport are stubbed.
jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../components/auth/BackgroundDecorations', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/auth/ZutsavLogoMark', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: 'light' } }));
// Animation is irrelevant to what is asserted here (text, requests); stub exactly the Reanimated APIs the auth UI uses.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chain = { duration: () => chain, delay: () => chain };
  return {
    __esModule: true,
    default: { View },
    FadeIn: chain, FadeInUp: chain, ZoomIn: chain,
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: (fn) => fn(),
    withTiming: (v) => v,
  };
});
jest.mock('../../../utils/socket', () => ({ disconnectSocket: jest.fn() }));

const hi = DICTIONARIES.hi;
const nav = () => ({ navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() });
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

beforeEach(() => {
  api.post.mockReset(); api.get.mockReset(); api.patch.mockReset();
  Toast.show.mockClear();
});

describe('LoginScreen', () => {
  it('English is unchanged', () => {
    render(<LoginScreen navigation={nav()} route={{ params: {} }} />);
    expect(screen.getByText('Your Gateway to Divine Experiences')).toBeTruthy();
    expect(screen.getByText('Continue your spiritual journey.')).toBeTruthy();
    expect(screen.getByPlaceholderText('Email / Phone')).toBeTruthy();
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
    expect(screen.getByText('Remember me')).toBeTruthy();
    expect(screen.getByText('Forgot Password?')).toBeTruthy();
    expect(screen.getByText('Login')).toBeTruthy();
    expect(screen.getByText('or')).toBeTruthy();
    expect(screen.getByText('Continue with OTP')).toBeTruthy();
    expect(screen.getByText(/Don't have an account\?/)).toBeTruthy();
  });

  it('renders in Hindi, immediately, when the language changes while mounted', async () => {
    render(<LoginScreen navigation={nav()} route={{ params: {} }} />);
    expect(screen.getByText('Login')).toBeTruthy();
    await setLang('hi');
    expect(screen.getByText(hi.auth.loginHeading)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi.auth.identifierPlaceholder)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi.auth.passwordPlaceholder)).toBeTruthy();
    expect(screen.getByText(hi.auth.forgotPassword)).toBeTruthy();
    expect(screen.getByText(hi.auth.continueWithOtp)).toBeTruthy();
    expect(screen.queryByText('Forgot Password?')).toBeNull();
  });

  it('a validation message is shown in the active language', async () => {
    await setLang('hi');
    render(<LoginScreen navigation={nav()} route={{ params: {} }} />);
    fireEvent.press(screen.getByText(hi.auth.login));
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.auth.enterCredentials });
  });

  it('a failed login shows the server message when there is one, else the localized fallback', async () => {
    await setLang('hi');
    const navigation = nav();
    render(<LoginScreen navigation={navigation} route={{ params: {} }} />);
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.identifierPlaceholder), 'a@example.invalid');
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.passwordPlaceholder), 'secret1');

    api.post.mockRejectedValueOnce({ response: { status: 401, data: { message: 'Invalid credentials' } } });
    fireEvent.press(screen.getByText(hi.auth.login));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Invalid credentials' }));

    Toast.show.mockClear();
    api.post.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { request: {} }));
    fireEvent.press(screen.getByText(hi.auth.login));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.auth.loginFailed }));
  });

  it('the login request itself is unchanged (identifier + password + rememberMe)', async () => {
    await setLang('hi');
    render(<LoginScreen navigation={nav()} route={{ params: {} }} />);
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.identifierPlaceholder), ' a@example.invalid ');
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.passwordPlaceholder), 'secret1');
    api.post.mockResolvedValueOnce({ data: { token: 't', user: { _id: 'u1', preferredLanguage: 'hi' } } });
    fireEvent.press(screen.getByText(hi.auth.login));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/auth/login', { emailOrPhone: 'a@example.invalid', password: 'secret1', rememberMe: true });
  });

  it('the deletion-pending restore card is localized and the date is inserted literally', async () => {
    await setLang('hi');
    const route = { params: { deletionPending: { token: 'tk', user: { _id: 'u1' }, scheduledDeletionDate: '2026-03-01T00:00:00.000Z' } } };
    render(<LoginScreen navigation={nav()} route={route} />);
    expect(await screen.findByText(hi.auth.deletionPendingTitle)).toBeTruthy();
    expect(screen.getByText(hi.auth.restoreMyAccount)).toBeTruthy();
    expect(screen.getByText(hi.auth.continueWithDeletion)).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
  });
});

describe('RegisterScreen', () => {
  it('English is unchanged', () => {
    render(<RegisterScreen navigation={nav()} route={{ params: {} }} />);
    expect(screen.getByText('Create Your Spiritual Journey')).toBeTruthy();
    expect(screen.getByText('Full Name')).toBeTruthy();
    expect(screen.getByText('Mobile Number')).toBeTruthy();
    expect(screen.getByText('Email Address')).toBeTruthy();
    expect(screen.getByText('Referral Code (optional)')).toBeTruthy();
    expect(screen.getByText('Register As')).toBeTruthy();
    expect(screen.getByText('Devotee')).toBeTruthy();
    expect(screen.getByText('Pandit')).toBeTruthy();
    expect(screen.getByText('Book poojas and spiritual services')).toBeTruthy();
    expect(screen.getByText('Continue →')).toBeTruthy();
    expect(screen.getByText(/Already have an account\?/)).toBeTruthy();
  });

  it('renders in Hindi, including role cards and placeholders', async () => {
    await setLang('hi');
    render(<RegisterScreen navigation={nav()} route={{ params: {} }} />);
    expect(screen.getByText(hi.auth.registerHeading)).toBeTruthy();
    expect(screen.getByText(hi.auth.fullName)).toBeTruthy();
    expect(screen.getByText(hi.auth.mobileNumber)).toBeTruthy();
    expect(screen.getByText(hi.auth.referralCodeOptional)).toBeTruthy();
    expect(screen.getByText(hi.auth.devotee)).toBeTruthy();
    expect(screen.getByText(hi.auth.devoteeDesc)).toBeTruthy();
    expect(screen.getByText(hi.auth.pandit)).toBeTruthy();
    expect(screen.getByText(hi.auth.panditDesc)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi.auth.fullNamePlaceholder)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi.auth.mobilePlaceholder)).toBeTruthy();
    expect(screen.getByText(hi.auth.continueArrow)).toBeTruthy();
  });

  it('validation messages are localized', async () => {
    await setLang('hi');
    render(<RegisterScreen navigation={nav()} route={{ params: {} }} />);
    fireEvent.press(screen.getByText(hi.auth.continueArrow));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi.auth.fieldsRequired });

    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.fullNamePlaceholder), 'Asha');
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.mobilePlaceholder), '1234567890');
    fireEvent.changeText(screen.getByPlaceholderText('your@email.com'), 'a@example.invalid');
    fireEvent.press(screen.getByText(hi.auth.continueArrow));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi.auth.invalidPhone });

    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.mobilePlaceholder), '9876543210');
    fireEvent.changeText(screen.getByPlaceholderText('your@email.com'), 'not-an-email');
    fireEvent.press(screen.getByText(hi.auth.continueArrow));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi.auth.invalidEmail });
  });

  it('navigation params keep API values (role is "user"/"pandit", not the translated label) and the referral code', async () => {
    await setLang('hi');
    const navigation = nav();
    render(<RegisterScreen navigation={navigation} route={{ params: { referralCode: 'ABCDEF' } }} />);
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.fullNamePlaceholder), ' Asha ');
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.mobilePlaceholder), '9876543210');
    fireEvent.changeText(screen.getByPlaceholderText('your@email.com'), 'A@Example.Invalid');
    fireEvent.press(screen.getByText(hi.auth.pandit));
    fireEvent.press(screen.getByText(hi.auth.continueArrow));
    expect(navigation.navigate).toHaveBeenCalledWith('VerificationChannel', {
      name: 'Asha', phone: '9876543210', email: 'a@example.invalid', role: 'pandit', referralCode: 'ABCDEF',
    });
  });
});

describe('VerificationChannelScreen', () => {
  const route = { params: { name: 'Asha', phone: '9876543210', email: 'a@example.invalid', role: 'user', referralCode: 'ABCDEF' } };

  it('English is unchanged', () => {
    render(<VerificationChannelScreen navigation={nav()} route={route} />);
    expect(screen.getByText('Verify Your Identity')).toBeTruthy();
    expect(screen.getByText("Choose how you'd like to receive your verification code.")).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Send OTP')).toBeTruthy();
    expect(screen.getByText('Back to registration')).toBeTruthy();
  });

  it('renders in Hindi; "WhatsApp" stays the brand name', async () => {
    await setLang('hi');
    render(<VerificationChannelScreen navigation={nav()} route={route} />);
    expect(screen.getByText(hi.auth.verifyHeading)).toBeTruthy();
    expect(screen.getByText(hi.auth.chooseChannel)).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText(hi.auth.channelEmail)).toBeTruthy();
    expect(screen.getByText(hi.auth.whatsappDesc)).toBeTruthy();
    expect(screen.getByText(hi.auth.emailDesc)).toBeTruthy();
    expect(screen.getByText(hi.auth.sendOtp)).toBeTruthy();
    expect(screen.getByText(hi.auth.backToRegistration)).toBeTruthy();
  });

  it('sends the OTP request unchanged and localizes the success toast per channel; "channel" stays an API value', async () => {
    await setLang('hi');
    const navigation = nav();
    api.post.mockResolvedValue({ data: { success: true } });
    render(<VerificationChannelScreen navigation={navigation} route={route} />);
    fireEvent.press(screen.getByText(hi.auth.sendOtp));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/auth/send-otp', { name: 'Asha', phone: '9876543210', email: 'a@example.invalid', channel: 'whatsapp' });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi.auth.otpSentWhatsApp });
    expect(navigation.navigate).toHaveBeenCalledWith('OTP', {
      phone: '9876543210', email: 'a@example.invalid', name: 'Asha', role: 'user', purpose: 'registration', channel: 'whatsapp', referralCode: 'ABCDEF',
    });

    Toast.show.mockClear(); navigation.navigate.mockClear();
    fireEvent.press(screen.getByText(hi.auth.channelEmail));
    fireEvent.press(screen.getByText(hi.auth.sendOtp));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalled());
    expect(api.post).toHaveBeenLastCalledWith('/auth/send-otp', expect.objectContaining({ channel: 'email' }));
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi.auth.otpSentEmail });
  });

  it('a failed send shows the server message, else the localized fallback', async () => {
    await setLang('hi');
    render(<VerificationChannelScreen navigation={nav()} route={route} />);
    api.post.mockRejectedValueOnce({ response: { status: 429, data: { message: 'Too many requests' } } });
    fireEvent.press(screen.getByText(hi.auth.sendOtp));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Too many requests' }));
    api.post.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(screen.getByText(hi.auth.sendOtp));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.auth.otpSendFailed }));
  });
});

describe('OTPScreen', () => {
  const route = { params: { phone: '9876543210', email: 'a@example.invalid', name: 'Asha', role: 'user', purpose: 'registration', channel: 'whatsapp', referralCode: 'ABCDEF' } };

  it('English is unchanged', () => {
    render(<OTPScreen navigation={nav()} route={route} />);
    expect(screen.getAllByText('Verify OTP')).toHaveLength(2); // heading + button
    expect(screen.getByText(/Enter the 6-digit code sent to/)).toBeTruthy();
    expect(screen.getByText('WhatsApp +91 9876543210')).toBeTruthy();
    expect(screen.getByText('Resend OTP in 30s')).toBeTruthy();
    expect(screen.getByText('Use a different verification method')).toBeTruthy();
  });

  it('renders in Hindi, with the countdown number inserted', async () => {
    await setLang('hi');
    render(<OTPScreen navigation={nav()} route={route} />);
    expect(screen.getAllByText(hi.auth.verifyOtp).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(hi.auth.enterCode.slice(0, 8)))).toBeTruthy();
    expect(screen.getByText(hi.auth.resendIn.replace('{{n}}', '30'))).toBeTruthy();
    expect(screen.getByText(hi.auth.changeMethod)).toBeTruthy();
    expect(screen.getByText('WhatsApp +91 9876543210')).toBeTruthy(); // brand + number, not translated
  });

  it('verifies with the unchanged request and carries the registration state forward', async () => {
    await setLang('hi');
    const navigation = nav();
    api.post.mockResolvedValue({ data: { success: true } });
    render(<OTPScreen navigation={navigation} route={route} />);
    // the button stays disabled until all six digits are entered, so nothing is sent early
    fireEvent.press(screen.getAllByText(hi.auth.verifyOtp).slice(-1)[0]);
    expect(api.post).not.toHaveBeenCalled();

    const boxes = screen.UNSAFE_getAllByType(TextInput);
    boxes.forEach((box, i) => fireEvent.changeText(box, String(i + 1)));
    fireEvent.press(screen.getAllByText(hi.auth.verifyOtp).slice(-1)[0]);
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/auth/verify-otp', { identifier: '9876543210', otp: '123456', purpose: 'registration' });
    expect(navigation.navigate).toHaveBeenCalledWith('SetPassword', {
      phone: '9876543210', email: 'a@example.invalid', name: 'Asha', role: 'user', channel: 'whatsapp', referralCode: 'ABCDEF',
    });
  });

  it('an invalid OTP shows the server message, else the localized fallback', async () => {
    await setLang('hi');
    render(<OTPScreen navigation={nav()} route={route} />);
    const boxes = screen.UNSAFE_getAllByType(TextInput);
    boxes.forEach((box, i) => fireEvent.changeText(box, String(i + 1)));
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { message: 'OTP expired' } } });
    fireEvent.press(screen.getAllByText(hi.auth.verifyOtp).slice(-1)[0]);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'OTP expired' }));
    api.post.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(screen.getAllByText(hi.auth.verifyOtp).slice(-1)[0]);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.auth.invalidOtp }));
  });
});

describe('SetPasswordScreen', () => {
  const route = { params: { phone: '9876543210', email: 'a@example.invalid', name: 'Asha', role: 'pandit', channel: 'email', referralCode: 'ABCDEF' } };
  const fill = (lang) => {
    const d = DICTIONARIES[lang] || DICTIONARIES.en;
    fireEvent.changeText(screen.getByPlaceholderText(d.auth.passwordHint), 'secret1');
    fireEvent.changeText(screen.getByPlaceholderText(d.auth.reenterPassword), 'secret1');
  };

  it('English is unchanged', () => {
    render(<SetPasswordScreen navigation={nav()} route={route} />);
    expect(screen.getByText('Set Password')).toBeTruthy();
    expect(screen.getByText('Create a secure password for your Zutsav account')).toBeTruthy();
    expect(screen.getByText('Password')).toBeTruthy();
    expect(screen.getByText('Confirm Password')).toBeTruthy();
    expect(screen.getByPlaceholderText('At least 6 characters')).toBeTruthy();
    expect(screen.getByPlaceholderText('Re-enter your password')).toBeTruthy();
    expect(screen.getByText('Create Account')).toBeTruthy();
  });

  it('renders in Hindi', async () => {
    await setLang('hi');
    render(<SetPasswordScreen navigation={nav()} route={route} />);
    expect(screen.getByText(hi.auth.setPasswordTitle)).toBeTruthy();
    expect(screen.getByText(hi.auth.setPasswordSubtitle)).toBeTruthy();
    expect(screen.getByText(hi.auth.confirmPassword)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi.auth.passwordHint)).toBeTruthy();
    expect(screen.getByText(hi.auth.createAccount)).toBeTruthy();
  });

  it('shows the mismatch hint in the active language', async () => {
    await setLang('hi');
    render(<SetPasswordScreen navigation={nav()} route={route} />);
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.passwordHint), 'secret1');
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.reenterPassword), 'secret2');
    expect(screen.getByText(hi.auth.passwordsMismatch)).toBeTruthy();
  });

  it('localized validation: too short / mismatch', async () => {
    await setLang('hi');
    render(<SetPasswordScreen navigation={nav()} route={route} />);
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.passwordHint), '123');
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.reenterPassword), '123');
    fireEvent.press(screen.getByText(hi.auth.createAccount));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi.auth.passwordMin });
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.passwordHint), 'secret1');
    fireEvent.changeText(screen.getByPlaceholderText(hi.auth.reenterPassword), 'secret2');
    fireEvent.press(screen.getByText(hi.auth.createAccount));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi.auth.passwordsMismatch });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('registration sends the selected language with every existing field, referral attribution and the English consent record', async () => {
    await setLang('hi');
    api.post.mockResolvedValue({ data: { token: 'tok', user: { _id: 'u9', preferredLanguage: 'hi' } } });
    render(<SetPasswordScreen navigation={nav()} route={route} />);
    fill('hi');
    fireEvent.press(screen.getByText(hi.auth.createAccount));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/auth/complete-registration');
    expect(body).toMatchObject({
      name: 'Asha', email: 'a@example.invalid', phone: '9876543210', password: 'secret1', role: 'pandit', channel: 'email',
      referralCode: 'ABCDEF', preferredLanguage: 'hi', serviceConsent: true, marketingConsent: false,
      serviceConsentVersion: 'v1.0', marketingConsentText: '', marketingConsentVersion: '',
    });
    // legal wording is sent exactly as approved (English), whatever the UI language
    expect(body.serviceConsentText).toBe('I agree to receive WhatsApp messages from the company regarding my account, bookings, orders and services.');
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi.auth.accountCreated }));
  });

  it('English users send preferredLanguage "en"; the language follows what was selected last', async () => {
    api.post.mockResolvedValue({ data: { token: 'tok', user: { _id: 'u9' } } });
    render(<SetPasswordScreen navigation={nav()} route={route} />);
    fill('en');
    fireEvent.press(screen.getByText('Create Account'));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1].preferredLanguage).toBe('en');
  });

  it('keeps the WhatsApp consent block in English (legal wording), even in Hindi', async () => {
    await setLang('hi');
    render(<SetPasswordScreen navigation={nav()} route={route} />);
    expect(screen.getByText('WhatsApp Communication Preferences')).toBeTruthy();
    expect(screen.getByText(/I agree to receive WhatsApp messages from the company/)).toBeTruthy();
    expect(screen.getByText(/I would also like to receive offers/)).toBeTruthy();
  });

  it('a failed registration shows the server message, else the localized fallback', async () => {
    await setLang('hi');
    render(<SetPasswordScreen navigation={nav()} route={route} />);
    fill('hi');
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { message: 'Email already registered' } } });
    fireEvent.press(screen.getByText(hi.auth.createAccount));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Email already registered' }));
    api.post.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(screen.getByText(hi.auth.createAccount));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi.auth.createAccountFailed }));
  });
});

describe('other locales render too (a representative screen per script)', () => {
  it.each(['mr', 'gu', 'ta', 'te', 'kn', 'ml', 'bn', 'pa', 'or'])('LoginScreen in %s', async (code) => {
    await setLang(code);
    render(<LoginScreen navigation={nav()} route={{ params: {} }} />);
    expect(screen.getByText(DICTIONARIES[code].auth.loginHeading)).toBeTruthy();
    expect(screen.getByText(DICTIONARIES[code].auth.continueWithOtp)).toBeTruthy();
  });
});
