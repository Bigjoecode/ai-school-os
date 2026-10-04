import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CodeInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Called once six digits are in (typed or pasted). */
  onComplete?: (value: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-describedby'?: string;
}

/**
 * A 6-digit authenticator code. One field rather than six boxes: pasting
 * "123 456" or "123456" just works, and phones offer the code from SMS/app
 * autofill (autocomplete="one-time-code").
 */
export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { id, value, onChange, onComplete, invalid, autoFocus, disabled, className, ...rest },
  ref,
) {
  const set = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    onChange(digits);
    if (digits.length === 6) onComplete?.(digits);
  };
  return (
    <Input
      ref={ref}
      id={id}
      value={value}
      onChange={(e) => set(e.target.value)}
      onPaste={(e) => {
        e.preventDefault();
        set(e.clipboardData.getData('text'));
      }}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={7}
      placeholder="000000"
      autoFocus={autoFocus}
      disabled={disabled}
      invalid={invalid}
      aria-describedby={rest['aria-describedby']}
      className={cn('h-12 text-center font-mono text-[22px] tracking-[0.5em] placeholder:tracking-[0.5em]', className)}
    />
  );
});
