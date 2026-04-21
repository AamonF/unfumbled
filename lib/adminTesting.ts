import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'unfumbled.admin.testing.v1';

export interface AdminTestingOverrides {
  /** When true, behave as a free user (Pro off, quotas). */
  simulateFreeUser: boolean;
  /**
   * null = default admin premium (Pro) unless `useRevenueCatOnly`.
   * true / false = force Pro on or off.
   */
  proOverride: boolean | null;
  /** When true, use RevenueCat entitlement instead of admin auto-premium. */
  useRevenueCatOnly: boolean;
}

export const DEFAULT_ADMIN_TESTING_OVERRIDES: AdminTestingOverrides = {
  simulateFreeUser: false,
  proOverride: null,
  useRevenueCatOnly: false,
};

export async function loadAdminTestingOverrides(): Promise<AdminTestingOverrides> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ADMIN_TESTING_OVERRIDES;
    const parsed = JSON.parse(raw) as Partial<AdminTestingOverrides>;
    return {
      simulateFreeUser: Boolean(parsed.simulateFreeUser),
      proOverride:
        parsed.proOverride === true || parsed.proOverride === false
          ? parsed.proOverride
          : null,
      useRevenueCatOnly: Boolean(parsed.useRevenueCatOnly),
    };
  } catch {
    return DEFAULT_ADMIN_TESTING_OVERRIDES;
  }
}

export async function persistAdminTestingOverrides(
  overrides: AdminTestingOverrides,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // non-fatal
  }
}

export async function clearAdminTestingOverrides(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // non-fatal
  }
}

/** Matches `AdminEntitlementMode` in EntitlementProvider (kept here to avoid a cycle). */
export type AdminEntitlementMode = 'auto' | 'revenuecat' | 'force_on' | 'force_off';

export const ADMIN_ENTITLEMENT_PICKER_OPTIONS = [
  'Auto',
  'RevenueCat',
  'Force Pro',
  'No Pro',
] as const;

export type AdminEntitlementPickerOption =
  (typeof ADMIN_ENTITLEMENT_PICKER_OPTIONS)[number];

export function adminEntitlementModeFromOverrides(
  t: AdminTestingOverrides,
): AdminEntitlementMode {
  if (t.useRevenueCatOnly) return 'revenuecat';
  if (t.proOverride === true) return 'force_on';
  if (t.proOverride === false) return 'force_off';
  return 'auto';
}

export function pickerOptionFromMode(mode: AdminEntitlementMode): AdminEntitlementPickerOption {
  switch (mode) {
    case 'auto':
      return 'Auto';
    case 'revenuecat':
      return 'RevenueCat';
    case 'force_on':
      return 'Force Pro';
    case 'force_off':
      return 'No Pro';
  }
}

export function modeFromPickerOption(
  opt: AdminEntitlementPickerOption,
): AdminEntitlementMode {
  switch (opt) {
    case 'Auto':
      return 'auto';
    case 'RevenueCat':
      return 'revenuecat';
    case 'Force Pro':
      return 'force_on';
    case 'No Pro':
      return 'force_off';
  }
}
