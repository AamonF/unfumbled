import { useEffect } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/constants';
import { AuthProvider } from '@/providers/AuthProvider';
import { RevenueCatProvider } from '@/providers/RevenueCatProvider';
import { EntitlementProvider } from '@/providers/EntitlementProvider';
import { UsageProvider } from '@/providers/UsageProvider';
import { SettingsProvider } from '@/providers/SettingsProvider';
import { PaywallModal } from '@/components';
import { useUsage } from '@/providers/UsageProvider';
import 'react-native-reanimated';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.surface,
    border: Colors.border,
    primary: Colors.primary,
    text: Colors.text,
    notification: Colors.primary,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RevenueCatProvider>
        <EntitlementProvider>
          <SettingsProvider>
            <UsageProvider>
              <ThemeProvider value={AppTheme}>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: Colors.background },
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="onboarding" />
                  <Stack.Screen name="login" />
                  <Stack.Screen name="signup" />
                  <Stack.Screen name="analyze" />
                  <Stack.Screen name="settings" />
                  <Stack.Screen name="results/[id]" />
                  <Stack.Screen
                    name="pricing"
                    options={{
                      presentation: 'modal',
                      contentStyle: { backgroundColor: Colors.background },
                    }}
                  />
                  <Stack.Screen
                    name="saved"
                    options={{
                      headerShown: true,
                      headerTitle: 'Saved',
                      headerStyle: { backgroundColor: Colors.surface },
                      headerTintColor: Colors.text,
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen name="admin" />
                  <Stack.Screen name="+not-found" />
                </Stack>
                <GlobalPaywall />
                <StatusBar style="light" />
              </ThemeProvider>
            </UsageProvider>
          </SettingsProvider>
        </EntitlementProvider>
      </RevenueCatProvider>
    </AuthProvider>
  );
}

function GlobalPaywall() {
  const { paywallVisible, hidePaywall, analysisCount } = useUsage();
  return (
    <PaywallModal
      visible={paywallVisible}
      onClose={hidePaywall}
      analysisCount={analysisCount}
    />
  );
}
