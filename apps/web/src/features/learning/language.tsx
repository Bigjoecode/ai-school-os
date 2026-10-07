import { LANGUAGES, languageInfo, type LanguageCode } from '@aischool/shared';
import { Languages } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** A language picker: each language named in itself ("Yorùbá"), with its English name for clarity. */
export function LanguageSelect({
  value,
  onChange,
  disabled,
  label = 'Language',
  compact,
  defaultLabel,
  className,
}: {
  value: LanguageCode | null;
  onChange: (code: LanguageCode | null) => void;
  disabled?: boolean;
  label?: string;
  /** Icon and the language's own name only (for a chat header). */
  compact?: boolean;
  /** Offer "School default (…)" as a choice, stored as null. */
  defaultLabel?: string;
  className?: string;
}) {
  const DEFAULT = '__default__';
  return (
    <Select value={value ?? (defaultLabel ? DEFAULT : 'EN')} onValueChange={(v) => onChange(v === DEFAULT ? null : (v as LanguageCode))} disabled={disabled}>
      <SelectTrigger aria-label={label} className={cn(compact ? 'h-8 w-auto gap-1 border-0 bg-muted/70 px-2 text-[12.5px] shadow-none' : 'w-full sm:w-64', className)}>
        {compact && <Languages className="size-3.5 text-muted-foreground" aria-hidden />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {defaultLabel && <SelectItem value={DEFAULT}>{defaultLabel}</SelectItem>}
        {LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code}>
            {l.label}
            {!compact && l.english !== l.label && !l.label.includes(l.english) ? <span className="text-muted-foreground"> · {l.english}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Spoken replies use English-centric voices: say so for Yoruba, Igbo and Hausa. */
export function accentNote(code: LanguageCode | null | undefined): string | null {
  const l = languageInfo(code);
  return l.accentedSpeech ? `Spoken replies in ${l.label} may sound accented: the voice is English-trained. Written replies are not affected.` : null;
}

/** "Explain in English" / "Explain in Yorùbá" under a reply: the request the student sends, and the language for that one reply. */
export function explainAgain(code: LanguageCode): { label: string; message: string } {
  const l = languageInfo(code);
  return { label: `Explain in ${l.label}`, message: `Please explain that again in ${l.english}.` };
}
