import AsyncStorage from '@react-native-async-storage/async-storage';

export async function loadPersistedState<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function savePersistedState(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the MVP resilient even if local storage is temporarily unavailable.
  }
}
