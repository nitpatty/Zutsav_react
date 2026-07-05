import React from 'react';
import api from '../../api/axios';
import NotificationsScreen from '../user/NotificationsScreen';

// Pandit reuses the shared notifications UI (list/search/mark-read/delete/
// clear-all) but needs its own tap-navigation, since the shared screen's
// default handlers target the customer tab names (BookingsTab/ShopTab),
// which don't exist in the Pandit tab navigator.
const goToBooking = async (data, navigation) => {
  if (!data.bookingNumber) return;
  const { data: res } = await api.get(`/bookings/by-number/${data.bookingNumber}`);
  navigation.navigate('PanditBookingsTab', { screen: 'PanditBookingDetail', params: { bookingId: res.bookingId } });
};

const panditHandlers = {
  new_booking:      goToBooking,
  referral_booking: goToBooking,
  referral_pending_remark: async (data, navigation) => {
    if (!data.referralId) return;
    const { data: res } = await api.get('/referral/my', { params: { limit: 100 } });
    const match = (res.referrals || []).find((r) => r._id === data.referralId);
    if (match) navigation.navigate('PanditReferralTab', { screen: 'PanditReferralDetail', params: { referral: match } });
  },
  kyc_approved:  async (_, navigation) => navigation.navigate('PanditProfileTab', { screen: 'PanditKYC' }),
  kyc_rejected:  async (_, navigation) => navigation.navigate('PanditProfileTab', { screen: 'PanditKYC' }),
  kyc_reupload:  async (_, navigation) => navigation.navigate('PanditProfileTab', { screen: 'PanditKYC' }),
  payout_released: async (_, navigation) => navigation.navigate('PanditHomeTab', { screen: 'PanditEarnings' }),
  pandit_approved: async (_, navigation) => navigation.navigate('PanditProfileTab', { screen: 'PanditProfileMain' }),
};

export default function PanditNotificationsScreen() {
  return <NotificationsScreen customHandlers={panditHandlers} />;
}
