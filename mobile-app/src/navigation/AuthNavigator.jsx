import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen    from '../screens/auth/SplashScreen';
import LoginScreen     from '../screens/auth/LoginScreen';
import RegisterScreen  from '../screens/auth/RegisterScreen';
import OTPScreen       from '../screens/auth/OTPScreen';
import SetPasswordScreen from '../screens/auth/SetPasswordScreen';

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="Splash"       component={SplashScreen} />
      <Stack.Screen name="Login"        component={LoginScreen} />
      <Stack.Screen name="Register"     component={RegisterScreen} />
      <Stack.Screen name="OTP"          component={OTPScreen} />
      <Stack.Screen name="SetPassword"  component={SetPasswordScreen} />
    </Stack.Navigator>
  );
}
