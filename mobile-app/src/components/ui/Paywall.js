import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, ScrollView, useWindowDimensions, Linking, Platform, AppState, TextInput } from 'react-native';
import Purchases from 'react-native-purchases';
import { useTheme } from '../../context/ThemeContext';
import { Star } from 'lucide-react-native';

export default function Paywall({ onPurchaseSuccess }) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const [packages, setPackages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [promoSuccess, setPromoSuccess] = useState(false);
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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        try {
          const customerInfo = await Purchases.getCustomerInfo();
          if (Object.keys(customerInfo.entitlements.active).length > 0) {
            onPurchaseSuccess();
          }
        } catch (e) {
          console.warn('Error refreshing RC info:', e);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [onPurchaseSuccess]);

  const purchasePackage = async (pack) => {
    try {
      setIsPurchasing(true);
      let customerInfo;

      if (Platform.OS === 'android' && pack.product.subscriptionOptions && pack.product.subscriptionOptions.length > 0) {
        // Timer: Launch period ends Sept 30, 2026, 11:59 PM (Local Device Time)
        const isLaunchPeriod = new Date() <= new Date('2026-09-30T23:59:59');
        
        const targetOfferId = promoSuccess 
          ? (isLaunchPeriod ? 'discord-launch' : 'discord-normal') 
          : (isLaunchPeriod ? 'launch-offer' : 'normal-offer');

        const targetedOffer = pack.product.subscriptionOptions.find(option => option.id.includes(targetOfferId));
        
        if (targetedOffer) {
          const result = await Purchases.purchaseSubscriptionOption(targetedOffer);
          customerInfo = result.customerInfo;
        } else {
          // Fallback just in case
          const result = await Purchases.purchasePackage(pack);
          customerInfo = result.customerInfo;
        }
      } else {
        const result = await Purchases.purchasePackage(pack);
        customerInfo = result.customerInfo;
      }

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

  const applyPromoCode = async () => {
    if (!promoCode.trim()) {
      Alert.alert('Notice', 'Please enter a valid promo code.');
      return;
    }
    
    if (promoCode.trim().toUpperCase() !== 'DISCORD2026') {
      Alert.alert('Error', 'Invalid or expired promo code.');
      return;
    }

    try {
      setIsApplyingPromo(true);
      const offerings = await Purchases.getOfferings();
      
      if (offerings.all['discord_launch'] && offerings.all['discord_launch'].availablePackages.length !== 0) {
        setPackages(offerings.all['discord_launch'].availablePackages);
        setPromoSuccess(true);
        Alert.alert('Success', 'Promo code applied! Prices have been updated with your 10% discount.');
      } else {
        Alert.alert('Notice', 'This promo is currently unavailable.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setIsApplyingPromo(false);
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
              
              // --- TIMER LOGIC FOR UI DISPLAY ---
              let displayPrice = pkg.product.priceString;
              const isLaunchPeriod = new Date() <= new Date('2026-09-30T23:59:59');

              if (Platform.OS === 'android' && pkg.product.subscriptionOptions && pkg.product.subscriptionOptions.length > 0) {
                const targetOfferId = promoSuccess 
                  ? (isLaunchPeriod ? 'discord-launch' : 'discord-normal') 
                  : (isLaunchPeriod ? 'launch-offer' : 'normal-offer');
                  
                const targetedOffer = pkg.product.subscriptionOptions.find(option => option.id.includes(targetOfferId));
                
                if (targetedOffer) {
                  // Find the first phase that actually charges money to display on the button
                  const paidPhase = targetedOffer.pricingPhases.find(p => p.price.amountMicros > 0);
                  if (paidPhase) {
                    displayPrice = paidPhase.price.formatted;
                  }
                }
              }
              // ----------------------------------

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
                      Try 3 days free, cancel anytime
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
                      {displayPrice}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {isPurchasing && <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 24 }} />}

        <TouchableOpacity onPress={restorePurchases} disabled={isPurchasing || isApplyingPromo} style={styles.restoreButton}>
          <Text style={[styles.restoreText, { color: theme.textMuted }]}>Restore Purchases</Text>
        </TouchableOpacity>

        {!promoSuccess ? (
          <View style={styles.promoContainer}>
            <TextInput
              style={[styles.promoInput, { color: theme.textPrimary, borderColor: theme.borderMid, backgroundColor: theme.surfaceMid }]}
              placeholder="Enter Promo Code"
              placeholderTextColor={theme.textMuted}
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              editable={!isApplyingPromo}
            />
            <TouchableOpacity 
              onPress={applyPromoCode} 
              disabled={isApplyingPromo || !promoCode.trim()} 
              style={[styles.promoApplyBtn, { backgroundColor: promoCode.trim() ? theme.accent : theme.surfaceMid }]}
            >
              {isApplyingPromo ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.promoApplyText, { color: promoCode.trim() ? theme.surface : theme.textMuted }]}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.promoSuccessContainer}>
            <Text style={[styles.promoSuccessText, { color: theme.accent }]}>✓ Promo Code Applied</Text>
          </View>
        )}
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
  promoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingBottom: 24,
    gap: 10,
  },
  promoInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  promoApplyBtn: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  promoApplyText: {
    fontWeight: '700',
    fontSize: 14,
  },
  promoSuccessContainer: {
    paddingBottom: 24,
    alignItems: 'center',
  },
  promoSuccessText: {
    fontWeight: '700',
    fontSize: 14,
  }
});
