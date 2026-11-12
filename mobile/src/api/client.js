import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Derive the backend host from the Metro dev server's own address, so this
// doesn't need hand-editing every time the dev machine's Wi-Fi IP changes.
// hostUri is only set when running via `expo start` (Expo Go / dev build);
// standalone/production builds fall back to BASE_URL_FALLBACK below.
const BASE_URL_FALLBACK = 'http://localhost:4000/api';
const devServerHost = Constants.expoConfig?.hostUri?.split(':')[0];
const BASE_URL = devServerHost ? `http://${devServerHost}:4000/api` : BASE_URL_FALLBACK;

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