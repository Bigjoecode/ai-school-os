import { languageInfo, type LanguageCode, type ParentLanguageInfo } from '@aischool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Languages } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import { LanguageSelect } from '../learning/language';
import { fk } from './api';

const langKey = ['family', 'language'] as const;

/** The parent's own language: weekly learning updates, the Parent AI and the WhatsApp assistant use it. */
export function ParentLanguageCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: langKey, queryFn: () => api.get<ParentLanguageInfo>('/family/language') });
  const save = useMutation({
    mutationFn: (language: LanguageCode | null) => api.put<ParentLanguageInfo>('/family/language', { language }),
    onSuccess: (r) => {
      qc.setQueryData(langKey, r);
      toast.success(`Saved: ${languageInfo(r.language ?? r.schoolDefault).label}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!q.data) return null;
  return (
    <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Languages className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">Your language</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            For your weekly learning updates and the school’s AI assistant (in the app and on WhatsApp). Subject names and scores stay as the school writes them.
          </p>
        </div>
      </div>
      <LanguageSelect
        label="Your language"
        value={q.data.language}
        defaultLabel={`School default (${languageInfo(q.data.schoolDefault).label})`}
        disabled={save.isPending}
        onChange={(code) => save.mutate(code)}
      />
    </Card>
  );
}

/** The language a child's AI tutor and careers counsellor explain in (the child can change it too). */
export function ChildTutorLanguageCard({ id, first, value }: { id: string; first: string; value: LanguageCode }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (language: LanguageCode | null) => api.put<{ tutorLanguage: LanguageCode }>(`/family/children/${id}/tutor-language`, { language }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: fk.child(id) });
      toast.success(`${first}’s tutor will explain in ${languageInfo(r.tutorLanguage).label}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Languages className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">Tutor language</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            The AI tutor explains in this language. Subject terms stay in English, as in WAEC and JAMB. {first} can change it too.
          </p>
        </div>
      </div>
      <LanguageSelect label={`${first}’s tutor language`} value={value} disabled={save.isPending} onChange={(code) => save.mutate(code)} />
    </Card>
  );
}
