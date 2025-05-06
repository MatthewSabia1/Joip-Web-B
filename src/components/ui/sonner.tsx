import { useTheme } from 'next-themes';
import { Toaster as Sonner, toast as sonnerToast } from 'sonner';
import { CheckCircledIcon, CrossCircledIcon, InfoCircledIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Export toast with our custom styling
export const toast = {
  ...sonnerToast,
  success: (message: string) => sonnerToast.success(message, {
    className: 'bg-green-50 dark:bg-green-950/50 border-green-500/50 text-green-800 dark:text-green-300',
    icon: <CheckCircledIcon className="h-5 w-5 text-green-500" />
  }),
  error: (message: string) => sonnerToast.error(message, {
    className: 'bg-red-50 dark:bg-red-950/50 border-red-500/50 text-red-800 dark:text-red-300',
    icon: <CrossCircledIcon className="h-5 w-5 text-red-500" />
  }),
  warning: (message: string) => sonnerToast.warning(message, {
    className: 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-500/50 text-yellow-800 dark:text-yellow-300',
    icon: <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
  }),
  info: (message: string) => sonnerToast.info(message, {
    className: 'bg-blue-50 dark:bg-blue-950/50 border-blue-500/50 text-blue-800 dark:text-blue-300',
    icon: <InfoCircledIcon className="h-5 w-5 text-blue-500" />
  })
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="bottom-center" 
      duration={5000}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
