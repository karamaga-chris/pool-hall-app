import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Backend address, in order of priority:
// 1. EXPO_PUBLIC_API_URL (set in eas.json for built APKs, e.g. https://xxx.onrender.com/api)
// 2. The Metro dev server's own host (Expo Go / dev), so the dev machine's
//    Wi-Fi IP doesn't need hand-editing. hostUri is only set via `expo start`.
// 3. localhost fallback.
const BASE_URL_FALLBACK = 'http://localhost:4000/api';
const devServerHost = Constants.expoConfig?.hostUri?.split(':')[0];
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (devServerHost ? `http://${devServerHost}:4000/api` : BASE_URL_FALLBACK);

const api = axios.create({ baseURL: BASE_URL, timeout: 10000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
    }
    return Promise.reject(err);
  }
);

export default api;