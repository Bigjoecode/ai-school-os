import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(inputClass, 'min-h-[88px] resize-y leading-relaxed', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
