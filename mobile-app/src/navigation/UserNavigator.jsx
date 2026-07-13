import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemeStore } from '../store/themeStore';
import { useNotificationStore } from '../store/notificationStore';
import { useCartStore } from '../store/cartStore';

// Screens
import DashboardScreen       from '../screens/user/DashboardScreen';
import BookingsScreen        from '../screens/user/BookingsScreen';
import BookingDetailScreen   from '../screens/user/BookingDetailScreen';
import BookingFlowScreen     from '../screens/user/BookingFlowScreen';
import PoojaListScreen       from '../screens/user/PoojaListScreen';
import MarketplaceScreen     from '../screens/user/MarketplaceScreen';
import ProductDetailScreen   from '../screens/user/ProductDetailScreen';
import CartScreen            from '../screens/user/CartScreen';
import OrdersScreen          from '../screens/user/OrdersScreen';
import OrderDetailScreen     from '../screens/user/OrderDetailScreen';
import ProfileScreen         from '../screens/user/ProfileScreen';
import PersonalInfoScreen    from '../screens/user/PersonalInfoScreen';
import AddressBookScreen     from '../screens/user/AddressBookScreen';
import ChangePasswordScreen  from '../screens/user/ChangePasswordScreen';
import PanchangScreen        from '../screens/user/PanchangScreen';
import FestivalsScreen       from '../screens/user/FestivalsScreen';
import FestivalDetailScreen  from '../screens/user/FestivalDetailScreen';
import TemplesScreen         from '../screens/user/TemplesScreen';
import TempleDetailScreen    from '../screens/user/TempleDetailScreen';
import NotificationsScreen   from '../screens/user/NotificationsScreen';
import SettingsScreen        from '../screens/user/SettingsScreen';
import AIAssistantScreen     from '../screens/user/AIAssistantScreen';
import DeleteAccountScreen   from '../screens/user/DeleteAccountScreen';
import LivestreamsScreen     from '../screens/user/LivestreamsScreen';
import PaymentVerifyScreen  from '../screens/user/PaymentVerifyScreen';
import BlogsScreen          from '../screens/user/BlogsScreen';
import BlogDetailScreen     from '../screens/user/BlogDetailScreen';
import InvoiceScreen        from '../screens/user/InvoiceScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const NO_HEADER = { headerShown: false };

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="Dashboard"     component={DashboardScreen} />
      <Stack.Screen name="PoojaList"     component={PoojaListScreen} />
      <Stack.Screen name="BookingFlow"   component={BookingFlowScreen} />
      <Stack.Screen name="Panchang"      component={PanchangScreen} />
      <Stack.Screen name="Festivals"     component={FestivalsScreen} />
      <Stack.Screen name="FestivalDetail" component={FestivalDetailScreen} />
      <Stack.Screen name="Temples"       component={TemplesScreen} />
      <Stack.Screen name="TempleDetail"  component={TempleDetailScreen} />
      <Stack.Screen name="Livestreams"   component={LivestreamsScreen} />
      <Stack.Screen name="AIAssistant"   component={AIAssistantScreen} />
      <Stack.Screen name="PaymentVerify"  component={PaymentVerifyScreen} />
      <Stack.Screen name="BookingDetail"  component={BookingDetailScreen} />
      <Stack.Screen name="Blogs"          component={BlogsScreen} />
      <Stack.Screen name="BlogDetail"     component={BlogDetailScreen} />
      <Stack.Screen name="Invoice"        component={InvoiceScreen} />
    </Stack.Navigator>
  );
}

function BookingsStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="BookingsList"   component={BookingsScreen} />
      <Stack.Screen name="BookingDetail"  component={BookingDetailScreen} />
      <Stack.Screen name="PaymentVerify"  component={PaymentVerifyScreen} />
      <Stack.Screen name="Invoice"        component={InvoiceScreen} />
    </Stack.Navigator>
  );
}

function ShopStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="Marketplace"    component={MarketplaceScreen} />
      <Stack.Screen name="ProductDetail"  component={ProductDetailScreen} />
      <Stack.Screen name="Cart"           component={CartScreen} />
      <Stack.Screen name="Orders"         component={OrdersScreen} />
      <Stack.Screen name="OrderDetail"    component={OrderDetailScreen} />
      <Stack.Screen name="Invoice"        component={InvoiceScreen} />
      <Stack.Screen name="PaymentVerify"  component={PaymentVerifyScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={NO_HEADER}>
      <Stack.Screen name="ProfileMain"     component={ProfileScreen} />
      <Stack.Screen name="PersonalInfo"    component={PersonalInfoScreen} />
      <Stack.Screen name="AddressBook"     component={AddressBookScreen} />
      <Stack.Screen name="ChangePassword"  component={ChangePasswordScreen} />
      <Stack.Screen name="Settings"       component={SettingsScreen} />
      <Stack.Screen name="DeleteAccount"  component={DeleteAccountScreen} />
      <Stack.Screen name="Notifications"  component={NotificationsScreen} />
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

export default function UserNavigator() {
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { unreadCount } = useNotificationStore();
  const cartCount = useCartStore((s) => s.items.reduce((a, i) => a + i.quantity, 0));

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown:     false,
        tabBarStyle:     { backgroundColor: C.tabBar, borderTopColor: C.border, height: 62, paddingBottom: 8 },
        tabBarActiveTintColor:   C.tabBarActive,
        tabBarInactiveTintColor: C.tabBarInactive,
        tabBarLabelStyle:  { fontSize: 10, fontWeight: '600', marginTop: -2 },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="BookingsTab"
        component={BookingsStack}
        options={{ title: 'Bookings', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="ShopTab"
        component={ShopStack}
        options={{
          title: 'Shop',
          tabBarIcon: ({ color, size }) => (
            <BadgeIcon name="bag-handle" size={size} color={color} count={cartCount} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
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
