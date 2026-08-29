import React, { memo, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Notification } from './NotificationTypes';
import { cn } from '../../utils/cn';

interface ToastNotificationProps {
  notification: Notification;
  onClose: (id: string) => void;
  className?: string;
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const iconColorMap = {
  success: 'text-green-600',
  error: 'text-red-600',
  warning: 'text-yellow-600',
  info: 'text-blue-600',
};

export const ToastNotification = memo(
  ({ notification, onClose, className }: ToastNotificationProps) => {
    const { id, type, title, message, duration = 5000, action, timestamp } = notification;
    const Icon = iconMap[type];

    useEffect(() => {
      if (duration > 0) {
        const timer = setTimeout(() => {
          onClose(id);
        }, duration);

        return () => clearTimeout(timer);
      }
    }, [id, duration, onClose]);

    const handleClose = () => {
      onClose(id);
    };

    const handleAction = () => {
      action?.onClick();
      onClose(id);
    };

    return (
      <div
        className={cn(
          'relative flex items-start gap-3 p-4 rounded-lg border shadow-lg max-w-md w-full',
          'transform transition-all duration-300 ease-in-out',
          'animate-in slide-in-from-right-5 fade-in-0',
          colorMap[type],
          className
        )}
        role="alert"
        aria-live={type === 'error' ? 'assertive' : 'polite'}
      >
        <div className="flex-shrink-0">
          <Icon 
            className={cn('w-5 h-5', iconColorMap[type])}
            aria-hidden="true"
          />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{title}</h4>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-1 rounded-md hover:bg-black/5 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4 opacity-60" />
            </button>
          </div>
          
          {message && (
            <p className="text-sm mt-1 opacity-90">{message}</p>
          )}
          
          {action && (
            <button
              onClick={handleAction}
              className="text-sm font-medium mt-2 underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-offset-1"
            >
              {action.label}
            </button>
          )}
          
          <div className="text-xs opacity-60 mt-2">
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        </div>
        
        {duration > 0 && (
          <div 
            className="absolute bottom-0 left-0 h-1 bg-current opacity-20 rounded-b-lg animate-pulse"
            style={{
              animation: `shrink ${duration}ms linear forwards`,
            }}
          />
        )}
      </div>
    );
  }
);

ToastNotification.displayName = 'ToastNotification';
