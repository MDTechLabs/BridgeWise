import React, { memo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ToastNotification } from './ToastNotification';
import { Notification, NotificationPositionType } from './NotificationTypes';
import { cn } from '../../utils/cn';

interface NotificationContainerProps {
  notifications: Notification[];
  onClose: (id: string) => void;
  position?: NotificationPositionType;
  className?: string;
  maxNotifications?: number;
}

const positionClasses: Record<NotificationPositionType, string> = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 transform -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2',
};

export const NotificationContainer = memo(
  ({ 
    notifications, 
    onClose, 
    position = 'top-right',
    className = '',
    maxNotifications = 5
  }: NotificationContainerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Limit number of notifications shown
    const visibleNotifications = notifications.slice(-maxNotifications);

    // Focus management for accessibility
    useEffect(() => {
      if (visibleNotifications.length > 0 && containerRef.current) {
        const firstNotification = containerRef.current.querySelector('[role="alert"]');
        if (firstNotification) {
          (firstNotification as HTMLElement).focus();
        }
      }
    }, [visibleNotifications]);

    // Prevent body scroll when notifications are present
    useEffect(() => {
      if (visibleNotifications.length > 0) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }

      return () => {
        document.body.style.overflow = '';
      };
    }, [visibleNotifications.length]);

    const container = (
      <div
        ref={containerRef}
        className={cn(
          'fixed z-50 flex flex-col gap-2 pointer-events-none',
          positionClasses[position],
          className
        )}
        aria-live="polite"
        aria-label="Notifications"
      >
        {visibleNotifications.map((notification, index) => (
          <div
            key={notification.id}
            className="pointer-events-auto"
            style={{
              animationDelay: `${index * 50}ms`,
              zIndex: 1000 + index,
            }}
          >
            <ToastNotification
              notification={notification}
              onClose={onClose}
            />
          </div>
        ))}
      </div>
    );

    // Use portal to render outside of normal DOM hierarchy
    return createPortal(container, document.body);
  }
);

NotificationContainer.displayName = 'NotificationContainer';
