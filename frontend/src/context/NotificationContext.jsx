import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';

function getNotificationUrl(notification) {
  const type = notification?.type || '';
  if (
    type === 'booking_created' || type === 'pandit_assigned' || type === 'pandit_accepted' ||
    type === 'new_booking' || type === 'booking_completed' || type === 'booking_assignment_pending'
  ) {
    return '/my-bookings';
  }
  if (type.startsWith('order_')) return '/my-orders';
  if (
    type === 'kyc_submitted' || type === 'kyc_approved' || type === 'kyc_rejected' ||
    type === 'kyc_reupload' || type === 'pandit_approved' || type === 'pandit_rejected' ||
    type === 'pandit_registered'
  ) {
    return '/pandit/dashboard';
  }
  return '/notifications';
}

const NotificationContext = createContext(null);

export function NotificationProvider({ children, user }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);
  const socketRef  = useRef(null);
  const navigate   = useNavigate();

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await API.get('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch { /* non-critical */ }
  }, [user]);

  const fetchNotifications = useCallback(async (page = 1) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await API.get(`/notifications?page=${page}&limit=20`);
      if (page === 1) {
        setNotifications(data.notifications);
      } else {
        setNotifications((prev) => [...prev, ...data.notifications]);
      }
      setUnreadCount(data.unread);
      return data;
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [user]);

  const markRead = useCallback(async (id) => {
    try {
      await API.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => n._id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await API.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, []);

  const deleteNotification = useCallback(async (id) => {
    const n = notifications.find((x) => x._id === id);
    try {
      await API.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((x) => x._id !== id));
      if (n && !n.isRead) setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  }, [notifications]);

  const clearAll = useCallback(async () => {
    try {
      await API.delete('/notifications/clear-all');
      setNotifications([]);
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, []);

  // Connect Socket.IO when user logs in
  useEffect(() => {
    if (!user) {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const token = localStorage.getItem('zutsav_token');
    if (!token) return;

    const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const serverUrl = apiBase.replace('/api', '');

    const socket = io(serverUrl, {
      auth:        { token },
      reconnection: true,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected');
      fetchUnreadCount();
    });

    socket.on('new_notification', (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((c) => c + 1);

      const targetUrl = getNotificationUrl(notification);

      toast.custom(
        (t) => (
          <div
            onClick={() => { toast.dismiss(t.id); navigate(targetUrl); }}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              padding: '14px 16px',
              maxWidth: '380px',
              width: '100%',
              cursor: 'pointer',
              opacity: t.visible ? 1 : 0,
              transition: 'opacity 0.25s ease',
            }}
          >
            <span style={{ fontSize: '20px', flexShrink: 0, marginTop: '2px' }}>🔔</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: '#111827', lineHeight: 1.4 }}>
                {notification.title}
              </p>
              {notification.message && (
                <p style={{
                  margin: '3px 0 0',
                  fontSize: '12px',
                  color: '#6B7280',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {notification.message}
                </p>
              )}
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9CA3AF' }}>
                Tap to view →
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9CA3AF', fontSize: '18px', lineHeight: 1,
                padding: '0 2px', flexShrink: 0, alignSelf: 'flex-start',
              }}
            >
              ×
            </button>
          </div>
        ),
        { duration: 5000, id: notification._id }
      );
    });

    socket.on('disconnect', () => console.log('[Socket.IO] Disconnected'));
    socket.on('connect_error', (err) => console.warn('[Socket.IO] Error:', err.message));

    socketRef.current = socket;

    // Initial load
    fetchNotifications(1);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, loading,
      fetchNotifications, fetchUnreadCount,
      markRead, markAllRead,
      deleteNotification, clearAll,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};
