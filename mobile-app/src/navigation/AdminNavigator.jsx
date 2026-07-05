import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/themeStore';
import { useNotificationStore } from '../store/notificationStore';

import AdminDashboardScreen     from '../screens/admin/AdminDashboardScreen';
import AdminActionCenterScreen  from '../screens/admin/AdminActionCenterScreen';
import AdminBookingsScreen      from '../screens/admin/AdminBookingsScreen';
import AdminBookingDetailScreen from '../screens/admin/AdminBookingDetailScreen';
import AdminPanditsScreen       from '../screens/admin/AdminPanditsScreen';
import AdminPanditDetailScreen  from '../screens/admin/AdminPanditDetailScreen';
import AdminUsersScreen         from '../screens/admin/AdminUsersScreen';
import AdminUserDetailScreen    from '../screens/admin/AdminUserDetailScreen';
import AdminOrdersScreen        from '../screens/admin/AdminOrdersScreen';
import AdminOrderDetailScreen   from '../screens/admin/AdminOrderDetailScreen';
import AdminProfileScreen       from '../screens/admin/AdminProfileScreen';
import AdminRefundsScreen       from '../screens/admin/AdminRefundsScreen';
import AdminRefundDetailScreen  from '../screens/admin/AdminRefundDetailScreen';
import AdminBlogsScreen         from '../screens/admin/AdminBlogsScreen';
import AdminBlogDetailScreen    from '../screens/admin/AdminBlogDetailScreen';
import AdminCommunicationScreen from '../screens/admin/AdminCommunicationScreen';
import AdminReferralAnalyticsScreen from '../screens/admin/AdminReferralAnalyticsScreen';
import AdminAnalyticsScreen     from '../screens/admin/AdminAnalyticsScreen';
import AdminGlobalSearchScreen  from '../screens/admin/AdminGlobalSearchScreen';
import AdminSystemHealthScreen  from '../screens/admin/AdminSystemHealthScreen';
import NotificationsScreen      from '../screens/user/NotificationsScreen';
import InvoiceScreen            from '../screens/user/InvoiceScreen';
import PersonalInfoScreen       from '../screens/user/PersonalInfoScreen';
import ChangePasswordScreen     from '../screens/user/ChangePasswordScreen';
import AdminDrawerContent       from './AdminDrawerContent';

const Tab    = createBottomTabNavigator();
const Stack  = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
const NO_HEADER = { headerShown: false };

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="AdminHome" component={AdminDashboardScreen} />
    </Stack.Navigator>
  );
}

function BookingsStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="AdminBookingsList"   component={AdminBookingsScreen} />
      <Stack.Screen name="AdminBookingDetail"  component={AdminBookingDetailScreen} />
      <Stack.Screen name="Invoice"              component={InvoiceScreen} />
    </Stack.Navigator>
  );
}

// Drawer-only: Refunds
function RefundsStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="AdminRefundsList"    component={AdminRefundsScreen} />
      <Stack.Screen name="AdminRefundDetail"   component={AdminRefundDetailScreen} />
      <Stack.Screen name="Invoice"              component={InvoiceScreen} />
    </Stack.Navigator>
  );
}

function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="AdminOrdersList"   component={AdminOrdersScreen} />
      <Stack.Screen name="AdminOrderDetail"  component={AdminOrderDetailScreen} />
    </Stack.Navigator>
  );
}

function NotificationsStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="AdminNotificationsList" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="AdminProfileHome" component={AdminProfileScreen} />
      <Stack.Screen name="PersonalInfo"     component={PersonalInfoScreen} />
      <Stack.Screen name="ChangePassword"   component={ChangePasswordScreen} />
    </Stack.Navigator>
  );
}

// Drawer-only stacks (moved out of the bottom tab bar per the new nav spec)
function PanditsStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="AdminPanditsList"   component={AdminPanditsScreen} />
      <Stack.Screen name="AdminPanditDetail"  component={AdminPanditDetailScreen} />
    </Stack.Navigator>
  );
}

// Kept reachable (not in the spec's drawer list, but this is working account-
// deletion-lifecycle management already shipped — dropping it would be a pure
// regression). Demoted from a bottom tab to a drawer entry.
function UsersStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="AdminUsersList"   component={AdminUsersScreen} />
      <Stack.Screen name="AdminUserDetail"  component={AdminUserDetailScreen} />
    </Stack.Navigator>
  );
}

// Drawer-only: Blogs
function BlogsStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="AdminBlogsList"   component={AdminBlogsScreen} />
      <Stack.Screen name="AdminBlogDetail"  component={AdminBlogDetailScreen} />
    </Stack.Navigator>
  );
}

function BadgeIcon({ name, color, size, count }) {
  return (
    <View>
      <Ionicons name={name} size={size} color={color} />
      {count > 0 && (
        <View style={{
          position: 'absolute', top: -4, right: -6,
          backgroundColor: '#DC2626', borderRadius: 8,
          minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2,
        }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </View>
  );
}

function AdminTabs() {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { unreadCount } = useNotificationStore();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: C.tabBar, borderTopColor: C.border, height: 62, paddingBottom: 8 },
        tabBarActiveTintColor:   C.tabBarActive,
        tabBarInactiveTintColor: C.tabBarInactive,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
      }}
    >
      <Tab.Screen
        name="AdminDashboardTab"
        component={DashboardStack}
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="AdminBookingsTab"
        component={BookingsStack}
        options={{ title: 'Bookings', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="AdminOrdersTab"
        component={OrdersStack}
        options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="AdminNotificationsTab"
        component={NotificationsStack}
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color, size }) => <BadgeIcon name="notifications" size={size} color={color} count={unreadCount} />,
        }}
      />
      <Tab.Screen
        name="AdminProfileTab"
        component={ProfileStack}
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}

export default function AdminNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <AdminDrawerContent {...props} />}
      screenOptions={{ headerShown: false, drawerType: 'front' }}
    >
      <Drawer.Screen name="AdminTabs" component={AdminTabs} />
      <Drawer.Screen name="ActionCenter" component={AdminActionCenterScreen} />
      <Drawer.Screen name="GlobalSearch" component={AdminGlobalSearchScreen} />
      <Drawer.Screen name="Pandits" component={PanditsStack} />
      <Drawer.Screen name="Users" component={UsersStack} />
      <Drawer.Screen name="Refunds" component={RefundsStack} />
      <Drawer.Screen name="Blogs" component={BlogsStack} />
      <Drawer.Screen name="Communication" component={AdminCommunicationScreen} />
      <Drawer.Screen name="ReferralAnalytics" component={AdminReferralAnalyticsScreen} />
      <Drawer.Screen name="Analytics" component={AdminAnalyticsScreen} />
      <Drawer.Screen name="SystemHealth" component={AdminSystemHealthScreen} />
    </Drawer.Navigator>
  );
}
