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
  onRegister,
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
});
