import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useNotificationStore } from '../store/notificationStore';
import { COLORS, RADIUS, SHADOW, FONT } from '../theme/tokens';

import PanditDashboardScreen  from '../screens/pandit/PanditDashboardScreen';
import PanditBookingsScreen   from '../screens/pandit/PanditBookingsScreen';
import PanditBookingDetailScreen from '../screens/pandit/PanditBookingDetailScreen';
import PanditProfileScreen    from '../screens/pandit/PanditProfileScreen';
import PanditPersonalInfoScreen from '../screens/pandit/PanditPersonalInfoScreen';
import PanditAddressScreen    from '../screens/pandit/PanditAddressScreen';
import PanditEducationScreen  from '../screens/pandit/PanditEducationScreen';
import PanditSpecializationsScreen from '../screens/pandit/PanditSpecializationsScreen';
import PanditPoojaServicesScreen from '../screens/pandit/PanditPoojaServicesScreen';
import PanditFamilyInfoScreen from '../screens/pandit/PanditFamilyInfoScreen';
import PanditBankUPIScreen    from '../screens/pandit/PanditBankUPIScreen';
import PanditKYCScreen        from '../screens/pandit/PanditKYCScreen';
import PanditAvailabilityScreen from '../screens/pandit/PanditAvailabilityScreen';
import PanditEarningsScreen   from '../screens/pandit/PanditEarningsScreen';
import PanditRatingsScreen    from '../screens/pandit/PanditRatingsScreen';
import PanditNotificationsScreen from '../screens/pandit/PanditNotificationsScreen';
import PanditSettingsScreen   from '../screens/pandit/PanditSettingsScreen';
import PanditReferralScreen  from '../screens/pandit/PanditReferralScreen';
import PanditReferralDetailScreen from '../screens/pandit/PanditReferralDetailScreen';
import PanditMyBlogsScreen    from '../screens/pandit/PanditMyBlogsScreen';
import PanditBlogEditorScreen from '../screens/pandit/PanditBlogEditorScreen';
import BlogsScreen           from '../screens/user/BlogsScreen';
import BlogDetailScreen      from '../screens/user/BlogDetailScreen';
import FestivalsScreen       from '../screens/user/FestivalsScreen';
import FestivalDetailScreen  from '../screens/user/FestivalDetailScreen';
import PanchangScreen        from '../screens/user/PanchangScreen';
import InvoiceScreen         from '../screens/user/InvoiceScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const NO_HEADER = { headerShown: false };

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="PanditDashboard"    component={PanditDashboardScreen} />
      <Stack.Screen name="PanditAvailability" component={PanditAvailabilityScreen} />
      <Stack.Screen name="PanditEarnings"     component={PanditEarningsScreen} />
      <Stack.Screen name="PanditRatings"      component={PanditRatingsScreen} />
      <Stack.Screen name="PanditMyBlogs"      component={PanditMyBlogsScreen} />
      <Stack.Screen name="PanditBlogEditor"   component={PanditBlogEditorScreen} />
      <Stack.Screen name="Blogs"             component={BlogsScreen} />
      <Stack.Screen name="BlogDetail"        component={BlogDetailScreen} />
      <Stack.Screen name="Festivals"          component={FestivalsScreen} />
      <Stack.Screen name="FestivalDetail"     component={FestivalDetailScreen} />
      <Stack.Screen name="Panchang"           component={PanchangScreen} />
    </Stack.Navigator>
  );
}

function BookingsStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="PanditBookingsList"   component={PanditBookingsScreen} />
      <Stack.Screen name="PanditBookingDetail"  component={PanditBookingDetailScreen} />
      <Stack.Screen name="Invoice"               component={InvoiceScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="PanditProfileMain"  component={PanditProfileScreen} />
      <Stack.Screen name="PanditPersonalInfo" component={PanditPersonalInfoScreen} />
      <Stack.Screen name="PanditAddress"      component={PanditAddressScreen} />
      <Stack.Screen name="PanditEducation"    component={PanditEducationScreen} />
      <Stack.Screen name="PanditSpecializations" component={PanditSpecializationsScreen} />
      <Stack.Screen name="PanditPoojaServices" component={PanditPoojaServicesScreen} />
      <Stack.Screen name="PanditFamilyInfo"   component={PanditFamilyInfoScreen} />
      <Stack.Screen name="PanditBankUPI"      component={PanditBankUPIScreen} />
      <Stack.Screen name="PanditKYC"          component={PanditKYCScreen} />
      <Stack.Screen name="PanditSettings"     component={PanditSettingsScreen} />
      <Stack.Screen name="PanditNotifications" component={PanditNotificationsScreen} />
    </Stack.Navigator>
  );
}

function ReferralStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="PanditReferralList"   component={PanditReferralScreen} />
      <Stack.Screen name="PanditReferralDetail" component={PanditReferralDetailScreen} />
    </Stack.Navigator>
  );
}

function BadgeIcon({ name, color, size, count }) {
  return (
    <View>
      <Ionicons name={name} size={size} color={color} />
      {count > 0 && (
        <View style={{
          position:'absolute', top:-4, right:-6,
          backgroundColor:'#DC2626', borderRadius:8,
          minWidth:16, height:16, justifyContent:'center', alignItems:'center', paddingHorizontal:2,
        }}>
          <Text style={{ color:'#fff', fontSize:9, fontWeight:'700' }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function PanditNavigator() {
  const { unreadCount } = useNotificationStore();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 16, right: 16, bottom: 16,
          height: 64,
          paddingBottom: 8, paddingTop: 8,
          backgroundColor: COLORS.surface,
          borderTopWidth: 0,
          borderRadius: RADIUS.xxl,
          ...SHADOW.floating,
        },
        tabBarActiveTintColor:   COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: FONT.size.label, fontWeight: FONT.weight.bold, marginTop: -2 },
      }}
    >
      <Tab.Screen
        name="PanditHomeTab"
        component={HomeStack}
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="PanditBookingsTab"
        component={BookingsStack}
        options={{ title: 'Bookings', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="PanditReferralTab"
        component={ReferralStack}
        options={{ title: 'Referrals', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="PanditProfileTab"
        component={ProfileStack}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <BadgeIcon name="person-circle" size={size} color={color} count={unreadCount} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
