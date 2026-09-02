import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Stable per-device id for attendance device-binding. Generated once and kept
 * in the OS keystore (expo-secure-store) so it survives app restarts and can't
 * be trivially read/copied between phones. On web (Expo preview) SecureStore is
 * unavailable, so we fall back to localStorage — fine, since real anti-proxy
 * punching happens on the phone.
 */
const KEY = 'altus_device_id';

function generate(): string {
  const rand = () => Math.random().toString(36).slice(2, 12);
  return `${Platform.OS}-${Date.now().toString(36)}-${rand()}${rand()}`;
}

export async function getDeviceId(): Promise<string> {
  if (Platform.OS === 'web') {
    const ls = globalThis.localStorage;
    let id = ls?.getItem(KEY) ?? null;
    if (!id) {
      id = generate();
      ls?.setItem(KEY, id);
    }
    return id;
  }
  let id = await SecureStore.getItemAsync(KEY);
  if (!id) {
    id = generate();
    await SecureStore.setItemAsync(KEY, id);
  }
  return id;
}
