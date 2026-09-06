/**
 * English translations for mobile referral and wallet screens.
 *
 * Structure mirrors the namespace pattern used by the website i18n,
 * keeping key names consistent across platforms for easier maintenance.
 *
 * To add a new locale: create e.g. `hi.js` with the same keys and
 * register it in `../index.js` LOCALES map.
 */
export default {
  referrals: {
    pageTitle: 'My Referrals',
    pageSubtitle: 'Share your referral link and earn rewards',
    generateCode: 'Generate New Referral',
    generating: 'Generating…',
    copyLink: 'Copy Link',
    linkCopied: 'Link copied!',
    shareWhatsApp: 'Share on WhatsApp',
    shareOther: 'Share',
    statusAvailable: 'Available',
    statusUsed: 'Used',
    statusExpired: 'Expired',
    createdDate: 'Created',
    expiresDate: 'Expires',
    usedDate: 'Used on',
    referredUser: 'Referred successfully',
    noReferralsTitle: 'No Referrals Yet',
    noReferralsDesc: 'Generate your first code and share it with friends to earn rewards.',
    dailyLimitInfo: '{{used}} / {{limit}} codes used today',
    rewardInfo: 'Earn +10 coins per referral',
    loading: 'Loading referrals…',
    error: 'Could not load referrals',
    generateError: 'Could not generate referral code',
    generateSuccess: 'Referral code generated!',
    dailyLimitReached: 'Daily limit reached ({{used}}/{{limit}})',
    retry: 'Retry',
  },
  wallet: {
    pageTitle: 'My Wallet',
    pageSubtitle: 'Your Zutsav coins and transaction history',
    balanceLabel: 'Current Balance',
    totalEarned: 'Earned',
    totalRedeemed: 'Redeemed',
    transactionsTitle: 'Transaction History',
    credit: 'Credit',
    debit: 'Debit',
    typeRegistration: 'Referral Registration',
    typeBookingReward: 'Referral Booking Reward',
    typeRedemption: 'Coin Redemption',
    typeAdjustment: 'Admin Adjustment',
    noTransactionsTitle: 'No Transactions Yet',
    noTransactionsDesc: 'Your coin transactions will appear here.',
    loading: 'Loading wallet…',
    error: 'Could not load wallet',
    retry: 'Retry',
  },
  common: {
    retry: 'Retry',
    cancel: 'Cancel',
    ok: 'OK',
  },
};
