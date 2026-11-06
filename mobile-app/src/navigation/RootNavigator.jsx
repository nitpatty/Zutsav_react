import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { usePanditStatusStore } from '../store/panditStatusStore';
import AuthNavigator from './AuthNavigator';
import UserNavigator from './UserNavigator';
import PanditNavigator from './PanditNavigator';
import PanditGateNavigator from './PanditGateNavigator';
import Toast from 'react-native-toast-message';
// The Admin module is reached ONLY through this seam (variants/adminModule); never import AdminNavigator directly.
import { AdminNavigator } from '../variants/adminModule';
import { getRoleSupport, unsupportedRoleMessage } from '../variants/roleSupport';
import { connectSocket, disconnectSocket, onNotification } from '../utils/socket';
import { useNotificationStore } from '../store/notificationStore';
import { useCartStore } from '../store/cartStore';
import usePaymentRecovery from '../hooks/usePaymentRecovery';

const Stack = createNativeStackNavigator();

function GateSpinner() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF8E7' }}>
      <ActivityIndicator size="large" color="#D4AF37" />
    </View>
  );
}

export default function RootNavigator() {
  const { user, ready, rejectUnsupportedSession } = useAuthStore();
  // Which kind of account is signed in, and whether THIS build serves it (variants/roleSupport). A role it does not
  // serve (Admin in the public app, or an unknown role) must never reach any navigator — least of all the User one.
  const roleSupport = user ? getRoleSupport(user.role) : null;
  const unsupportedRole = !!user && !roleSupport.supported;
  const { loadTheme }   = useThemeStore();
  const { addRealtime, fetchUnreadCount } = useNotificationStore();
  const { load: loadCart } = useCartStore();
  const { pandit, checkedOnce: panditCheckedOnce, fetch: fetchPanditStatus, reset: resetPanditStatus } = usePanditStatusStore();

  useEffect(() => { loadTheme(); }, []);

  // A customer who left the app to pay: re-check their pending payment with the server on launch and on every return
  // to the foreground (no-op until the session is restored; never navigates). See utils/paymentRecovery.
  usePaymentRecovery({ user, ready });

  // A signed-in user this build does not serve (e.g. the role changed on the server): say why, end the session.
  useEffect(() => {
    if (!unsupportedRole) return;
    Toast.show({ type: 'error', text1: unsupportedRoleMessage(roleSupport.reason) });
    rejectUnsupportedSession();
  }, [unsupportedRole]);

  useEffect(() => {
    if (!user || unsupportedRole) { disconnectSocket(); return; }
    connectSocket().then((sock) => {
      if (!sock) return;
      const off = onNotification((n) => addRealtime(n));
      return () => off();
    });
    fetchUnreadCount();
    if (user.role === 'user') loadCart();
  }, [user]);

  // Approval gate: a pandit's dashboard must never mount until their
  // application `status` is confirmed 'approved' — fetched fresh on every
  // login/app-restart so a status change (or role change from a fresh
  // login) is never served stale. Reset on logout/role-change so a later
  // pandit login on the same device never sees a previous account's status.
  useEffect(() => {
    if (user?.role === 'pandit') fetchPanditStatus();
    else resetPanditStatus();
  }, [user?._id, user?.role]);

  if (!ready) return <GateSpinner />;

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthNavigator} />
      </Stack.Navigator>
    );
  }

  // Unsupported role: nothing is mounted while the effect above clears the session (then the Auth stack shows).
  if (unsupportedRole) return <GateSpinner />;

  if (roleSupport.kind === 'admin') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Admin" component={AdminNavigator} />
      </Stack.Navigator>
    );
  }

  if (roleSupport.kind === 'pandit') {
    // Block until the FIRST status check resolves (success OR failure) —
    // never let PanditNavigator (Dashboard/Bookings/Earnings/Calendar/
    // Notifications/Settings) mount even momentarily while this is in
    // flight. Deliberately gated on `checkedOnce`, NOT on `phase` — once the
    // first check has settled, PanditGateNavigator stays mounted for every
    // later refresh/retry (pull-to-refresh, manual Refresh Status,
    // focus-refetch), which only update `phase`/`pandit` for the gate
    // screen to react to internally. Gating on `phase==='loading'` directly
    // caused an infinite remount loop: any failed retry flipped phase away
    // from 'loading', which unmounted the gate screen, whose focus-effect
    // immediately refetched, flipping phase back to 'loading' and unmounting
    // it again forever.
    if (!panditCheckedOnce) return <GateSpinner />;

    const approved = pandit?.status === 'approved';
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {approved
          ? <Stack.Screen name="Pandit" component={PanditNavigator} />
          : <Stack.Screen name="PanditGate" component={PanditGateNavigator} />}
      </Stack.Navigator>
    );
  }

  if (roleSupport.kind === 'user') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="User" component={UserNavigator} />
      </Stack.Navigator>
    );
  }

  return <GateSpinner />; // unreachable while getRoleSupport only returns the kinds above; never fall through to User
}
