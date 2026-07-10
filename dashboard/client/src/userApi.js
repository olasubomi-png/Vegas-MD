import axios from 'axios';

export const USER_TOKEN_KEY = 'account_token';

export function getUserToken() {
  return localStorage.getItem(USER_TOKEN_KEY);
}

export function setUserToken(token) {
  if (token) localStorage.setItem(USER_TOKEN_KEY, token);
  else localStorage.removeItem(USER_TOKEN_KEY);
}

const userApi = axios.create({ baseURL: '/api/user' });

userApi.interceptors.request.use((config) => {
  const token = getUserToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

userApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      setUserToken(null);
      window.location.href = '/account/login';
    }
    return Promise.reject(err);
  }
);

export default userApi;
