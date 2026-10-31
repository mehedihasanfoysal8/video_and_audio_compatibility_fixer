import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { Notification } from '../../types';

interface NotificationsProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

const icons: Record<Notification['type'], React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-400" />,
  error: <AlertCircle className="w-4 h-4 text-red-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
  info: <Info className="w-4 h-4 text-blue-400" />,
};

const bgClasses: Record<Notification['type'], string> = {
  success: 'bg-green-900/80 border-green-700',
  error: 'bg-red-900/80 border-red-700',
  warning: 'bg-yellow-900/80 border-yellow-700',
  info: 'bg-blue-900/80 border-blue-700',
};

export const Notifications: React.FC<NotificationsProps> = ({
  notifications,
  onDismiss,
}) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((n) => (
        <NotificationToast key={n.id} notification={n} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const NotificationToast: React.FC<{
  notification: Notification;
  onDismiss: (id: string) => void;
}> = ({ notification, onDismiss }) => {
  useEffect(() => {
    const duration = notification.duration ?? 4000;
    const timer = setTimeout(() => onDismiss(notification.id), duration);
    return () => clearTimeout(timer);
  }, [notification.id, notification.duration, onDismiss]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl
        ${bgClasses[notification.type]} animate-slide-up`}
    >
      <div className="flex-shrink-0 mt-0.5">{icons[notification.type]}</div>
      <p className="flex-1 text-sm text-white">{notification.message}</p>
      <button
        onClick={() => onDismiss(notification.id)}
        className="flex-shrink-0 text-white/50 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

