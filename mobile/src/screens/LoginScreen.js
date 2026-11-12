import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, radius, font } from '../utils/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!phone || !pin)
      return Alert.alert('Missing fields', 'Enter your phone number and PIN.');
    setLoading(true);
    try {
      await login(phone, pin);
    } catch (err) {
      Alert.alert(
        'Login failed',
        `Status: ${err.response?.status || 'no response'}\nCode: ${err.code || 'n/a'}\nURL: ${err.config?.baseURL || ''}${err.config?.url || ''}\nMessage: ${err.message}\nServer said: ${JSON.stringify(err.response?.data)}`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>🎱 Pool Hall</Text>
          <Text style={styles.subtitle}>Staff & Owner Login</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={styles.input}
            placeholder="+250 7XX XXX XXX"
            placeholderTextColor={colors.textDisabled}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCorrect={false}
          />

          <Text style={styles.label}>PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="4-digit PIN"
            placeholderTextColor={colors.textDisabled}
            value={pin}
            onChangeText={setPin}
            keyboardType="numeric"
            secureTextEntry
            maxLength={4}
          />

          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.black} />
              : <Text style={styles.btnText}>Login</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { color: colors.textPrimary, fontSize: font.xxl, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: font.base, marginTop: spacing.xs },
  form: { gap: spacing.sm },
  label: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: font.base,
    marginBottom: spacing.sm,
  },
  btn: {
    backgroundColor: colors.amber,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnText: { color: colors.black, fontSize: font.md, fontWeight: '700' },
});