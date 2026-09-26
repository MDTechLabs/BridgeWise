export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // in milliseconds, 0 = persistent
  action?: {
    label: string;
    onClick: () => void;
  };
  timestamp: number;
}

export interface NotificationPosition {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export type NotificationPositionType = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
