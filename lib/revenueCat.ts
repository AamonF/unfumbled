import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ─── Configuration ────────────────────────────────────────────────────────────

const APPLE_API_KEY =
  (Constants.expoConfig?.extra?.revenueCatAppleApiKey as string | undefined) ??
  process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ??
  '';

const GOOGLE_API_KEY =
  (Constants.expoConfig?.extra?.revenueCatGoogleApiKey as string | undefined) ??
  process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ??
  '';

export const ENTITLEMENT_ID = 'pro';

// ─── Init ─────────────────────────────────────────────────────────────────────

let _initialised = false;
let _initError: string | null = null;

/**
 * Returns the platform-appropriate key prefix expected by the native
 * react-native-purchases SDK. Apple keys are `appl_…`, Google keys are
 * `goog_…`. A `test_…` key is a RevenueCat Web Billing sandbox key and
 * will NOT work with the native iOS/Android SDK.
 */
function expectedKeyPrefix(): 'appl_' | 'goog_' {
  return Platform.OS === 'android' ? 'goog_' : 'appl_';
}

export function configureRevenueCat(): void {
  if (_initialised) return;

  const apiKey = Platform.OS === 'android' ? GOOGLE_API_KEY : APPLE_API_KEY;

  if (!apiKey) {
    _initError = `No API key for ${Platform.OS}. Set EXPO_PUBLIC_REVENUECAT_${Platform.OS === 'android' ? 'GOOGLE' : 'APPLE'}_API_KEY in .env.local.`;
    console.warn('[RevenueCat]', _initError);
    return;
  }

  // HARD validation: wrong-prefix keys (e.g. `test_…` RevenueCat Web Billing
  // sandbox keys) MUST NOT reach `Purchases.configure` on the native side.
  // The iOS SDK's native initializer raises an NSException for invalid keys,
  // which escapes the JS try/catch below and takes down the app at launch —
  // exactly the TestFlight-crash scenario we hit shipping a `test_…` key.
  // Fail closed here so the app still boots; RC features simply stay disabled
  // until a real platform key (`appl_…` / `goog_…`) is provided.
  const expected = expectedKeyPrefix();
  if (!apiKey.startsWith(expected)) {
    _initError =
      `Wrong API key prefix for ${Platform.OS} — expected "${expected}", ` +
      `got "${apiKey.slice(0, 5)}…". Use a Public app-specific API key from ` +
      `https://app.revenuecat.com → Project → API Keys.`;
    console.warn('[RevenueCat]', _initError);
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  try {
    Purchases.configure({ apiKey });
    _initialised = true;
    _initError = null;
  } catch (err) {
    _initError = err instanceof Error ? err.message : String(err);
    console.warn('[RevenueCat] configure() threw:', _initError);
  }
}

export function revenueCatInitError(): string | null {
  return _initError;
}

export function isRevenueCatConfigured(): boolean {
  return _initialised;
}

// ─── User identity ────────────────────────────────────────────────────────────

export async function loginRevenueCat(appUserId: string): Promise<CustomerInfo> {
  if (!_initialised) throw new Error('[RevenueCat] SDK not initialised');
  const { customerInfo } = await Purchases.logIn(appUserId);
  return customerInfo;
}

export async function logoutRevenueCat(): Promise<void> {
  if (!_initialised) return;
  const isAnon = await Purchases.isAnonymous();
  if (!isAnon) {
    await Purchases.logOut();
  }
}

// ─── Offerings ────────────────────────────────────────────────────────────────

export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!_initialised) return null;
  try {
    return await Purchases.getOfferings();
  } catch (err) {
    console.warn('[RevenueCat] getOfferings failed:', err);
    return null;
  }
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

// ─── Entitlement helpers ──────────────────────────────────────────────────────

export function customerHasPro(info: CustomerInfo): boolean {
  return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!_initialised) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (err) {
    console.warn('[RevenueCat] getCustomerInfo failed:', err);
    return null;
  }
}
