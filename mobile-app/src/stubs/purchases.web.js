/**
 * purchases.web.js
 * Web stub for react-native-purchases (RevenueCat).
 * Auto-grants Pro entitlement on web so all features, announcements, and callouts
 * can be freely tested in the browser.
 */

const mockCustomerInfo = {
  entitlements: {
    all: {
      pro: {
        identifier: "pro",
        isActive: true,
        willRenew: false,
        periodType: "NORMAL",
        latestPurchaseDate: new Date().toISOString(),
        originalPurchaseDate: new Date().toISOString(),
        expirationDate: null,
      },
    },
    active: {
      pro: {
        identifier: "pro",
        isActive: true,
        willRenew: false,
        periodType: "NORMAL",
        latestPurchaseDate: new Date().toISOString(),
        originalPurchaseDate: new Date().toISOString(),
        expirationDate: null,
      },
    },
  },
  activeSubscriptions: ["pro_subscription"],
  allPurchasedProductIdentifiers: ["pro_subscription"],
  nonSubscriptionTransactions: [],
  firstSeen: new Date().toISOString(),
  originalAppUserId: "web-test-pilot",
  requestDate: new Date().toISOString(),
};

const Purchases = {
  configure: () => {},
  setLogLevel: () => {},
  getCustomerInfo: async () => mockCustomerInfo,
  getOfferings: async () => ({
    current: null,
    all: {},
  }),
  purchasePackage: async () => ({
    customerInfo: mockCustomerInfo,
    productIdentifier: "pro_subscription",
  }),
  restorePurchases: async () => mockCustomerInfo,
  addCustomerInfoUpdateListener: () => () => {},
  removeCustomerInfoUpdateListener: () => {},
  setAttributes: async () => {},
  setEmail: async () => {},
  setDisplayName: async () => {},
};

export default Purchases;
