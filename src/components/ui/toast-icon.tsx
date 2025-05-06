import { ExclamationTriangleIcon, CheckCircledIcon, CrossCircledIcon, InfoCircledIcon } from '@radix-ui/react-icons';

interface ToastIconProps {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
  className?: string;
}

export function ToastIcon({ variant = 'default', className = '' }: ToastIconProps) {
  const iconClasses = `h-5 w-5 mr-2 ${className}`;

  switch (variant) {
    case 'destructive':
      return <CrossCircledIcon className={iconClasses} />;
    case 'success':
      return <CheckCircledIcon className={iconClasses} />;
    case 'warning':
      return <ExclamationTriangleIcon className={iconClasses} />;
    case 'info':
      return <InfoCircledIcon className={iconClasses} />;
    default:
      return null;
  }
}