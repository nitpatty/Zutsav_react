import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import CustomInput from './CustomInput';
import RememberMe from './RememberMe';
import GradientButton from './GradientButton';
import { AUTH_COLORS } from './colors';

export default function LoginCard({
  identifier, onChangeIdentifier,
  password, onChangePassword,
  showPassword, onToggleShowPassword,
  remember, onToggleRemember,
  onForgotPassword,
  onLogin, loading,
  onRegister, onOtpLogin,
}) {
  return (
    <View style={styles.card}>
      <CustomInput
        value={identifier}
        onChangeText={onChangeIdentifier}
        placeholder="Email / Phone"
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="next"
        style={{ marginBottom: 14 }}
      />

      <CustomInput
        value={password}
        onChangeText={onChangePassword}
        placeholder="Password"
        secureTextEntry={!showPassword}
        rightIcon={showPassword ? 'eye-outline' : 'eye-off-outline'}
        onRightIconPress={onToggleShowPassword}
        returnKeyType="done"
        onSubmitEditing={onLogin}
        style={{ marginBottom: 16 }}
      />

      <View style={styles.row}>
        <RememberMe checked={remember} onToggle={onToggleRemember} />
        <TouchableOpacity onPress={onForgotPassword} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.forgot}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      <GradientButton title={loading ? 'Logging in…' : 'Login'} onPress={onLogin} loading={loading} disabled={loading} />

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity style={styles.otpBtn} onPress={onOtpLogin} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.otpBtnText}>Continue with OTP</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.registerRow} onPress={onRegister} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.registerText}>
          Don't have an account? <Text style={styles.registerLink}>Register</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AUTH_COLORS.card,
    borderRadius: 28,
    padding: 24,
    shadowColor: AUTH_COLORS.cardShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  forgot: {
    fontSize: 13.5,
    fontWeight: '600',
    color: AUTH_COLORS.forgotText,
  },
  registerRow: { alignItems: 'center', marginTop: 16 },
  registerText: { fontSize: 13.5, color: AUTH_COLORS.subtitle },
  registerLink: { color: AUTH_COLORS.link, fontWeight: '700' },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: AUTH_COLORS.inputBorder },
  dividerText: { fontSize: 12, color: AUTH_COLORS.placeholder, textTransform: 'uppercase' },

  otpBtn: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.forgotText,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(184,134,59,0.06)',
  },
  otpBtnText: { color: AUTH_COLORS.forgotText, fontSize: 14, fontWeight: '700' },
});
