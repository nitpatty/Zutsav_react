import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { urls } from '../config';

let socket = null;

export const connectSocket = async () => {
  if (socket?.connected) return socket;

  const token = await SecureStore.getItemAsync('zutsav_token');
  if (!token) return null;

  socket = io(urls.socketUrl, {
    auth:        { token },
    transports:  ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => console.log('[Socket] Connected'));
  socket.on('disconnect', () => console.log('[Socket] Disconnected'));
  socket.on('connect_error', (err) => console.log('[Socket] Error:', err.message));

  return socket;
};

export const disconnectSocket = () => {
  if (socket) { socket.disconnect(); socket = null; }
};

export const getSocket = () => socket;

export const onNotification = (handler) => {
  if (!socket) return () => {};
  socket.on('new_notification', handler);
  return () => socket.off('new_notification', handler);
};
