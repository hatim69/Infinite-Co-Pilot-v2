import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { Plane, ShieldAlert } from 'lucide-react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../utils/beta';

export default function Gatekeeper({ onVerify }) {
  const { theme } = useTheme();
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(null);

  const handleVerify = async () => {
    if (!code.trim()) {
      setError('Please enter a beta code.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    // Simulate network delay for effect
    setTimeout(async () => {
      const cleanCode = code.trim().toUpperCase();
      
      // Master Key bypass (disabled for security in distribution)
      /*
      if (cleanCode === MASTER_KEY) {
        try {
          await AsyncStorage.setItem('beta_verified_master', 'true');
          onVerify();
        } catch (e) {
          setError('Failed to save verification state.');
        }
        setIsVerifying(false);
        return;
      }
      */
      
      try {
        // Query Supabase for the code where is_used is false
        const response = await fetch(`${SUPABASE_URL}/rest/v1/beta_codes?code=eq.${cleanCode}&is_used=eq.false&select=*`, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Supabase Error ${response.status}: ${errText}`);
        }
        
        const data = await response.json();
        
        if (data && data.length > 0) {
          const rowId = data[0].id;
          
          // Mark the code as used
          const patchResponse = await fetch(`${SUPABASE_URL}/rest/v1/beta_codes?id=eq.${rowId}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ is_used: true })
          });
          
          if (patchResponse.ok) {
            await AsyncStorage.setItem('beta_verified', 'true');
            onVerify();
          } else {
            setError('Failed to claim code. Please try again.');
          }
        } else {
          setError('Invalid or already used beta code.');
        }
      } catch (e) {
        setError(e.message || 'Network error checking code. Please check your connection.');
      }
      
      setIsVerifying(false);
    }, 800);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={[styles.iconWrapper, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}>
            <ShieldAlert size={48} color={theme.accent} />
          </View>
          
          <Text style={[styles.title, { color: theme.textPrimary }]}>Closed Beta</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Infinite Co-Pilot is currently in closed beta. Please enter your invitation code to continue.
          </Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input, 
                { 
                  backgroundColor: theme.inputBg, 
                  borderColor: error ? '#F87171' : theme.border, 
                  color: theme.textPrimary 
                }
              ]}
              placeholder="e.g. BETA-XXXX-XXXX"
              placeholderTextColor={theme.textFaint}
              value={code}
              onChangeText={(text) => {
                setCode(text);
                setError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isVerifying}
            />
            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.verifyBtn, 
              { backgroundColor: isVerifying ? theme.accentBgStrong : theme.connectBtn },
              (!code.trim() || isVerifying) && { opacity: 0.7 }
            ]}
            onPress={handleVerify}
            disabled={!code.trim() || isVerifying}
            activeOpacity={0.8}
          >
            {isVerifying ? (
              <ActivityIndicator color={theme.accentText} size="small" />
            ) : (
              <Text style={[styles.verifyBtnText, { color: theme.buttonText || '#FFF' }]}>
                VERIFY CODE
              </Text>
            )}
          </TouchableOpacity>
          
          <Text style={[styles.disclaimer, { color: theme.textFaint }]}>
            An active internet connection is required to verify the beta validity period.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  iconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 24,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
  },
  verifyBtn: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  verifyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  }
});
