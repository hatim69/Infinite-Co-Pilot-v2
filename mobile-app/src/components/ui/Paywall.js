import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, ScrollView, useWindowDimensions } from 'react-native';
import Purchases from 'react-native-purchases';
import { useTheme } from '../../context/ThemeContext';
import { Star } from 'lucide-react-native';

export default function Paywall({ onPurchaseSuccess }) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const [packages, setPackages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const isCompactWidth = width < 380;
  const isShortHeight = height < 720;

  useEffect(() => {
    const fetchOfferings = async () => {
      try {
        const offerings = await Purchases.getOfferings();
        if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
          setPackages(offerings.current.availablePackages);
        }
      } catch (e) {
        console.warn('RevenueCat error:', e.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOfferings();
  }, []);

  const purchasePackage = async (pack) => {
    try {
      setIsPurchasing(true);
      const { customerInfo } = await Purchases.purchasePackage(pack);
      if (Object.keys(customerInfo.entitlements.active).length > 0) {
        onPurchaseSuccess();
      } else {
        // Fallback check in case of delayed processing
        const latestInfo = await Purchases.getCustomerInfo();
        if (Object.keys(latestInfo.entitlements.active).length > 0) {
          onPurchaseSuccess();
        } else {
          Alert.alert('Notice', 'Purchase processed, but entitlement not found. Try restarting the app.');
        }
      }
    } catch (e) {
      if (!e.userCancelled) {
        Alert.alert('Error purchasing', e.message);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    try {
      setIsPurchasing(true);
      const customerInfo = await Purchases.restorePurchases();
      if (Object.keys(customerInfo.entitlements.active).length > 0) {
        Alert.alert('Success', 'Purchases restored successfully!');
        onPurchaseSuccess();
      } else {
        Alert.alert('Notice', 'No active subscription found.');
      }
    } catch (e) {
      Alert.alert('Error restoring', e.message);
    } finally {
      setIsPurchasing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={{ color: theme.textMuted, marginTop: 16 }}>Loading subscriptions...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isShortHeight && styles.contentCompact,
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.iconWrapper, isShortHeight && styles.iconWrapperCompact, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}>
          <Star size={isShortHeight ? 36 : 44} color={theme.accent} />
        </View>

        <Text
          style={[styles.title, isCompactWidth && styles.titleCompact, { color: theme.textPrimary }]}
          numberOfLines={2}
          adjustsFontSizeToFit
        >
          Infinite Co-Pilot Pro
        </Text>
        <Text style={[styles.subtitle, isShortHeight && styles.subtitleCompact, { color: theme.textMuted }]}>
          Unlock real-time flight telemetry, custom co-pilot announcements, and full simulator connectivity.
        </Text>

        <View style={styles.packagesContainer}>
          {packages.length === 0 ? (
            <Text style={{ color: theme.textMuted, textAlign: 'center' }}>
              No subscription packages found. Ensure RevenueCat is configured correctly in the dashboard.
            </Text>
          ) : (
            packages.map((pkg, index) => {
              const isAnnual = pkg.packageType === 'ANNUAL' || pkg.product.identifier.includes('annual');
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.packageButton,
                    isCompactWidth && styles.packageButtonCompact,
                    { 
                      backgroundColor: isAnnual ? theme.accentBg : theme.surfaceMid, 
                      borderColor: isAnnual ? theme.accent : theme.borderMid,
                      borderWidth: isAnnual ? 2 : 1
                    }
                  ]}
                  onPress={() => purchasePackage(pkg)}
                  disabled={isPurchasing}
                  activeOpacity={0.8}
                >
                  <View style={styles.packageCopy}>
                    <View style={styles.packageHeader}>
                      <Text
                        style={[
                          styles.packageTitle,
                          isCompactWidth && styles.packageTitleCompact,
                          { color: isAnnual ? theme.accentText : theme.textPrimary },
                        ]}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                      >
                        {pkg.product.title.split('(')[0].trim()}
                      </Text>
                      {isAnnual && (
                        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                          <Text style={styles.badgeText}>BEST VALUE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.packageDescription, { color: isAnnual ? theme.accentText : theme.textMuted }]}>
                      Includes 3-Day Free Trial
                    </Text>
                  </View>
                  <View style={styles.packagePriceWrap}>
                    <Text
                      style={[
                        styles.packagePrice,
                        isCompactWidth && styles.packagePriceCompact,
                        { color: isAnnual ? theme.accentText : theme.textPrimary },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {pkg.product.priceString}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {isPurchasing && <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 24 }} />}

        <TouchableOpacity onPress={restorePurchases} disabled={isPurchasing} style={styles.restoreButton}>
          <Text style={[styles.restoreText, { color: theme.textMuted }]}>Restore Purchases</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'center',
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  contentCompact: {
    paddingTop: 16,
    justifyContent: 'flex-start',
  },
  iconWrapper: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  iconWrapperCompact: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 8,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 24,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 4,
    maxWidth: 430,
  },
  subtitleCompact: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  packagesContainer: {
    width: '100%',
    gap: 14,
  },
  packageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 92,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  packageButtonCompact: {
    minHeight: 104,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  packageCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  packageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  packageTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 18,
    fontWeight: '700',
  },
  packageTitleCompact: {
    fontSize: 16,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 0.5,
  },
  packageDescription: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  packagePriceWrap: {
    width: '36%',
    minWidth: 96,
    maxWidth: 150,
    alignItems: 'flex-end',
  },
  packagePrice: {
    width: '100%',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'right',
  },
  packagePriceCompact: {
    fontSize: 19,
  },
  restoreButton: {
    padding: 16,
    marginTop: 'auto',
    paddingTop: 30,
  },
  restoreText: {
    fontSize: 13,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
