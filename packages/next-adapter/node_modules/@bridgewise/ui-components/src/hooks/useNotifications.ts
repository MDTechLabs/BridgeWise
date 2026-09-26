import { useState, useCallback } from 'react';
import { Notification, NotificationType } from '../components/Notifications/NotificationTypes';

interface UseNotificationsReturn {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
  showSuccess: (title: string, message?: string, duration?: number) => void;
  showError: (title: string, message?: string, duration?: number) => void;
  showWarning: (title: string, message?: string, duration?: number) => void;
  showInfo: (title: string, message?: string, duration?: number) => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'timestamp'>) => {
      const newNotification: Notification = {
        ...notification,
        id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      };

      setNotifications(prev => [...prev, newNotification]);
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const showSuccess = useCallback(
    (title: string, message?: string, duration = 5000) => {
      addNotification({
        type: 'success',
        title,
        message,
        duration,
      });
    },
    [addNotification]
  );

  const showError = useCallback(
    (title: string, message?: string, duration = 0) => {
      addNotification({
        type: 'error',
        title,
        message,
        duration, // Error notifications persist by default
      });
    },
    [addNotification]
  );

  const showWarning = useCallback(
    (title: string, message?: string, duration = 7000) => {
      addNotification({
        type: 'warning',
        title,
        message,
        duration,
      });
    },
    [addNotification]
  );

  const showInfo = useCallback(
    (title: string, message?: string, duration = 5000) => {
      addNotification({
        type: 'info',
        title,
        message,
        duration,
      });
    },
    [addNotification]
  );

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
}
