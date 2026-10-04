import type { UploadedFile } from '@aischool/shared';
import { FileUp, ShieldCheck } from 'lucide-react';
import { useRef } from 'react';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Segmented } from '../operations/ui';

/**
 * Shared bits for "upload our own curriculum / scheme of work": the private
 * file upload and the file-or-pasted-text picker used by both dialogs.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT =
  '.pdf,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp';
const ALLOWED = /\.(pdf|docx|jpe?g|png|webp)$/i;

/** POST /files/private (multipart `file`) — returns the stored file. */
export async function uploadPrivateFile(file: File): Promise<UploadedFile> {
  if (!ALLOWED.test(file.name)) throw new ApiError(415, 'Upload a PDF, a Word document (.docx) or a photo (JPG, PNG or WebP).');
  if (file.size > MAX_BYTES) throw new ApiError(413, 'That file is larger than 10 MB.');
  const send = () => {
    const form = new FormData();
    form.append('file', file);
    const token = useAuthStore.getState().accessToken;
    return fetch('/api/files/private', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = 'Upload failed. Please try again.';
    try {
      const b = (await res.json()) as { message?: string | string[] };
      if (b.message) message = Array.isArray(b.message) ? b.message.join('. ') : b.message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as UploadedFile;
}

export type DocMode = 'file' | 'text';

export interface DocValue {
  mode: DocMode;
  file: File | null;
  text: string;
}

export const emptyDoc = (): DocValue => ({ mode: 'file', file: null, text: '' });

/** Client-side check before uploading; returns an error per field. */
export function docErrors(v: DocValue): { file?: string; text?: string } {
  if (v.mode === 'file' && !v.file) return { file: 'Choose a PDF, Word document or photo' };
  if (v.mode === 'text' && v.text.trim().length < 80) return { text: 'Paste the whole document — at least a few lines' };
  return {};
}

/** Uploads the file if there is one, and returns the import body fields. */
export async function docPayload(v: DocValue): Promise<{ fileId?: string; text?: string }> {
  if (v.mode === 'file' && v.file) return { fileId: (await uploadPrivateFile(v.file)).id };
  return { text: v.text.trim() };
}

export function NothingInventedNote({ noun }: { noun: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[13px]">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      <p className="min-w-0 text-muted-foreground">
        <span className="font-medium text-foreground">We’ll lay out your own document {noun} as an editable draft. Nothing is invented.</span>{' '}
        Check it over, make any changes, then publish it.
      </p>
    </div>
  );
}

export function DocumentPicker({
  idPrefix,
  value,
  onChange,
  errors,
}: {
  idPrefix: string;
  value: DocValue;
  onChange: (v: DocValue) => void;
  errors: { file?: string; text?: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { mode, file, text } = value;
  return (
    <div className="grid gap-4">
      <Segmented
        label="Source"
        value={mode}
        onChange={(m) => onChange({ ...value, mode: m })}
        options={[
          { value: 'file', label: 'Upload a file' },
          { value: 'text', label: 'Paste text' },
        ]}
      />
      {mode === 'file' ? (
        <Field
          label="Document"
          htmlFor={`${idPrefix}-file`}
          error={errors.file}
          hint="PDF, Word (.docx) or a clear photo of the page (JPG, PNG, WebP), up to 10 MB. For a scanned PDF, upload a photo instead or paste the text."
        >
          <button
            type="button"
            id={`${idPrefix}-file`}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border border-dashed p-4 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              file ? 'border-brand bg-brand-soft/30' : errors.file ? 'border-danger' : 'border-border',
            )}
          >
            <FileUp className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-medium">{file ? file.name : 'Choose a file'}</span>
              <span className="block text-[12px] text-muted-foreground">
                {file ? `${formatNumber(Math.max(1, Math.round(file.size / 1024)))} KB · click to change` : 'Click to browse'}
              </span>
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a document"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onChange({ ...value, file: f });
              e.target.value = '';
            }}
          />
        </Field>
      ) : (
        <Field label="Text" htmlFor={`${idPrefix}-text`} error={errors.text} hint={`${formatNumber(text.length)} characters`}>
          <Textarea
            id={`${idPrefix}-text`}
            rows={10}
            value={text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            placeholder="Paste your document here — topics, weeks, objectives, anything it has…"
            invalid={!!errors.text}
          />
        </Field>
      )}
    </div>
  );
}
