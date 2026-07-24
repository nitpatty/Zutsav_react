import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PanditStatusScreen from '../screens/pandit/PanditStatusScreen';
import PanditKYCScreen from '../screens/pandit/PanditKYCScreen';

const Stack = createNativeStackNavigator();

// Mounted by RootNavigator instead of PanditNavigator whenever a pandit's
// application `status` isn't 'approved' — see panditStatusStore.js. Kept
// deliberately minimal (status screen + KYC re-submission only) so a
// pending/rejected/suspended pandit has no route into Bookings, Earnings,
// Calendar, Notifications, or Settings.
export default function PanditGateNavigator() {
  return (
    <Stack.Navigator initialRouteName="PanditStatusGate" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PanditStatusGate" component={PanditStatusScreen} />
      <Stack.Screen name="PanditKYC" component={PanditKYCScreen} />
    </Stack.Navigator>
  );
}
