import {
  CAREER_FIELDS,
  COURSE_SOURCES,
  INTEREST_TYPES,
  RIASEC,
  TRACK_LABELS,
  TRACKS,
  careerSchema,
  courseSchema,
  formatOlevel,
  type CareerFull,
  type CareerInput,
  type CourseInput,
  type CourseRow,
  type InterestType,
  type Track,
} from '@aischool/shared';
import { BadgeCheck, Briefcase, Clock, FileSpreadsheet, FileUp, GraduationCap, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { JambStatusPanel } from './jamb-status-panel';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useConsoleCareers, useConsoleCourses, useDeleteConsoleCareer, useDeleteConsoleCourse, useSaveConsoleCareer, useSaveConsoleCourse } from '../careers/api';
import { apiFieldErrors, FormError, zodErrors } from '../operations/ui';
import { BrochureImport, CsvImport } from './careers-import';
import { FilterSelect, Toolbar, useTabParam } from './ui';

const TABS = ['careers', 'courses', 'csv', 'brochure'] as const;
const splitList = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
const splitLines = (s: string) => s.split(/\n/).map((x) => x.trim()).filter(Boolean);
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export default function CareersContentPage() {
  const [tab, setTab] = useTabParam(TABS, 'careers');
  const [career, setCareer] = useState<CareerFull | 'new' | null>(null);
  const [course, setCourse] = useState<CourseRow | 'new' | null>(null);
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Careers & courses"
        description="The career library every school’s students explore, and university courses with their admission requirements. Students only see requirements marked verified against the JAMB brochure."
        actions={
          tab === 'careers' ? (
            <Button onClick={() => setCareer('new')}>
              <Plus /> New career
            </Button>
          ) : tab === 'courses' ? (
            <Button onClick={() => setCourse('new')}>
              <Plus /> New course
            </Button>
          ) : null
        }
      />
      <JambStatusPanel />
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList className="no-scrollbar max-w-full overflow-x-auto">
          <TabsTrigger value="careers">
            <Briefcase /> Careers
          </TabsTrigger>
          <TabsTrigger value="courses">
            <GraduationCap /> Courses & requirements
          </TabsTrigger>
          <TabsTrigger value="csv">
            <FileSpreadsheet /> CSV import
          </TabsTrigger>
          <TabsTrigger value="brochure">
            <FileUp /> JAMB brochure
          </TabsTrigger>
        </TabsList>
        <TabsContent value="careers">
          <CareersTab onEdit={setCareer} />
        </TabsContent>
        <TabsContent value="courses">
          <CoursesTab onEdit={setCourse} />
        </TabsContent>
        <TabsContent value="csv">
          <CsvImport onSaved={() => setTab('courses')} />
        </TabsContent>
        <TabsContent value="brochure">
          <BrochureImport onSaved={() => setTab('courses')} />
        </TabsContent>
      </Tabs>
      <CareerDialog career={career} onClose={() => setCareer(null)} />
      <CourseDialog course={course} onClose={() => setCourse(null)} />
    </Page>
  );
}

// ------------------------------------------------------------------ careers

function CareersTab({ onEdit }: { onEdit: (c: CareerFull) => void }) {
  const q = useConsoleCareers();
  const del = useDeleteConsoleCareer();
  const [search, setSearch] = useState('');
  const [field, setField] = useState<string>();
  const [deleting, setDeleting] = useState<CareerFull | null>(null);
  const s = useDebounced(search.trim().toLowerCase(), 200);
  const fields = useMemo(() => [...new Set([...(q.data ?? []).map((c) => c.field), ...CAREER_FIELDS])].sort(), [q.data]);
  const rows = q.data?.filter((c) => (!field || c.field === field) && (!s || `${c.name} ${c.slug} ${c.summary}`.toLowerCase().includes(s)));
  const columns: Column<CareerFull>[] = [
    {
      key: 'name',
      header: 'Career',
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium">{c.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{c.slug}</p>
        </div>
      ),
    },
    { key: 'field', header: 'Field', cell: (c) => c.field },
    { key: 'tracks', header: 'Tracks', cell: (c) => c.tracks.map((t) => TRACK_LABELS[t]).join(', ') || '—' },
    { key: 'interests', header: 'Interests', cell: (c) => c.interests.join(' ') || '—' },
    { key: 'courses', header: 'Courses', cell: (c) => c.courses.length },
    { key: 'status', header: 'Status', cell: (c) => (c.published ? <Badge variant="success">Published</Badge> : <Badge variant="outline">Hidden</Badge>) },
    {
      key: 'actions',
      header: '',
      className: 'w-20 text-right',
      cell: (c) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={(e) => (e.stopPropagation(), setDeleting(c))}>
          <Trash2 />
        </Button>
      ),
    },
  ];
  return (
    <Card className="overflow-hidden p-0">
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search careers…" label="Search careers" className="sm:w-72" />
        <FilterSelect value={field} onChange={setField} options={fields.map((f) => ({ value: f, label: f }))} label="Field" allLabel="All fields" className="sm:w-56" />
        <span className="text-[12.5px] text-muted-foreground sm:ml-auto">{rows ? `${rows.length} of ${q.data?.length ?? 0}` : ''}</span>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        onRowClick={onEdit}
        rowLabel={(c) => `Edit ${c.name}`}
        renderMobile={(c) => (
          <div className="min-w-0">
            <p className="font-medium">{c.name}</p>
            <p className="text-[12px] text-muted-foreground">
              {c.field} · {c.tracks.map((t) => TRACK_LABELS[t]).join(', ') || 'no track'} {c.published ? '' : '· hidden'}
            </p>
          </div>
        )}
        empty={{ icon: Briefcase, title: 'No careers yet', description: 'The shipped career library installs at start-up; you can also add careers here.' }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'career'}?`}
        description="It disappears from the library and from students’ saved careers. Hiding it (unpublish) keeps it for later instead."
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Career deleted');
              setDeleting(null);
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </Card>
  );
}

interface CareerForm {
  name: string;
  slug: string;
  field: string;
  summary: string;
  description: string;
  dayToDay: string;
  skills: string;
  subjects: string;
  tracks: Track[];
  interests: InterestType[];
  courses: string;
  otherRoutes: string;
  professionalBodies: string;
  outlook: string;
  published: boolean;
}

const emptyCareer: CareerForm = { name: '', slug: '', field: CAREER_FIELDS[0], summary: '', description: '', dayToDay: '', skills: '', subjects: '', tracks: [], interests: [], courses: '', otherRoutes: '', professionalBodies: '', outlook: '', published: true };

function CareerDialog({ career, onClose }: { career: CareerFull | 'new' | null; onClose: () => void }) {
  const save = useSaveConsoleCareer();
  const [f, setF] = useState<CareerForm>(emptyCareer);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(false);
  useEffect(() => {
    if (!career) return;
    setErrors({});
    setSlugTouched(career !== 'new');
    setF(
      career === 'new'
        ? emptyCareer
        : {
            name: career.name,
            slug: career.slug,
            field: career.field,
            summary: career.summary,
            description: career.description ?? '',
            dayToDay: career.dayToDay ?? '',
            skills: career.skills.join(', '),
            subjects: career.subjects.join(', '),
            tracks: career.tracks,
            interests: career.interests,
            courses: career.courses.join('\n'),
            otherRoutes: career.otherRoutes ?? '',
            professionalBodies: career.professionalBodies.join('\n'),
            outlook: career.outlook ?? '',
            published: career.published,
          },
    );
  }, [career]);
  const set = <K extends keyof CareerForm>(k: K, v: CareerForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const body: CareerInput = {
      ...f,
      skills: splitList(f.skills),
      subjects: splitList(f.subjects),
      courses: splitLines(f.courses),
      professionalBodies: splitLines(f.professionalBodies),
    };
    const parsed = careerSchema.safeParse(body);
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    save.mutate(
      { id: career && career !== 'new' ? career.id : undefined, body },
      {
        onSuccess: () => {
          toast.success(career === 'new' ? 'Career added' : 'Career saved');
          onClose();
        },
        onError: (err) => setErrors({ ...apiFieldErrors(err), form: errorMessage(err) }),
      },
    );
  };
  const toggleInterest = (t: InterestType) => set('interests', f.interests.includes(t) ? f.interests.filter((x) => x !== t) : [...f.interests, t].slice(0, 3));
  return (
    <FormDialog open={!!career} onOpenChange={(o) => !o && onClose()} title={career === 'new' ? 'New career' : 'Edit career'} icon={<Briefcase />} submitLabel="Save" pending={save.isPending} onSubmit={submit} size="xl">
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="c-name" error={errors.name}>
            <Input id="c-name" value={f.name} onChange={(e) => (set('name', e.target.value), !slugTouched && set('slug', slugify(e.target.value)))} />
          </Field>
          <Field label="Slug" htmlFor="c-slug" error={errors.slug} hint="Used in links; lowercase-with-hyphens">
            <Input id="c-slug" value={f.slug} onChange={(e) => (setSlugTouched(true), set('slug', e.target.value))} />
          </Field>
          <Field label="Field" htmlFor="c-field" error={errors.field}>
            <Input id="c-field" list="career-fields" value={f.field} onChange={(e) => set('field', e.target.value)} />
            <datalist id="career-fields">
              {CAREER_FIELDS.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <SwitchRow label="Published" description="Shown to students">
            <Switch checked={f.published} onCheckedChange={(v) => set('published', v)} aria-label="Published" />
          </SwitchRow>
        </div>
        <Field label="Summary" htmlFor="c-summary" error={errors.summary} hint="One or two sentences for the career card">
          <Textarea id="c-summary" rows={2} value={f.summary} onChange={(e) => set('summary', e.target.value)} />
        </Field>
        <Field label="What the work is" htmlFor="c-desc" optional error={errors.description}>
          <Textarea id="c-desc" rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="A typical day" htmlFor="c-day" optional error={errors.dayToDay}>
          <Textarea id="c-day" rows={3} value={f.dayToDay} onChange={(e) => set('dayToDay', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Skills" htmlFor="c-skills" hint="Comma-separated" error={errors.skills}>
            <Textarea id="c-skills" rows={2} value={f.skills} onChange={(e) => set('skills', e.target.value)} />
          </Field>
          <Field label="Helpful subjects" htmlFor="c-subjects" hint="Comma-separated, e.g. Biology, Chemistry" error={errors.subjects}>
            <Textarea id="c-subjects" rows={2} value={f.subjects} onChange={(e) => set('subjects', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SS1 tracks" error={errors.tracks}>
            <div className="flex flex-wrap gap-3">
              {TRACKS.map((t) => (
                <label key={t} className="flex items-center gap-2 text-[13.5px]">
                  <Checkbox checked={f.tracks.includes(t)} onCheckedChange={(v) => set('tracks', v === true ? [...f.tracks, t] : f.tracks.filter((x) => x !== t))} />
                  {TRACK_LABELS[t]}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Interest types (strongest first, up to 3)" error={errors.interests}>
            <div className="flex flex-wrap gap-1.5">
              {RIASEC.map((t) => {
                const i = f.interests.indexOf(t);
                return (
                  <button key={t} type="button" onClick={() => toggleInterest(t)} aria-pressed={i >= 0} className={cn('rounded-full border px-2.5 py-1 text-[12.5px]', i >= 0 ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground')}>
                    {i >= 0 && `${i + 1}. `}
                    {t} · {INTEREST_TYPES[t].name}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <Field label="University / polytechnic courses" htmlFor="c-courses" hint="One per line; new names are added to the course list without requirements" error={errors.courses}>
          <Textarea id="c-courses" rows={3} value={f.courses} onChange={(e) => set('courses', e.target.value)} />
        </Field>
        <Field label="Other routes in" htmlFor="c-routes" optional hint="ND/HND, apprenticeships, professional exams">
          <Textarea id="c-routes" rows={2} value={f.otherRoutes} onChange={(e) => set('otherRoutes', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Professional bodies" htmlFor="c-bodies" optional hint="One per line">
            <Textarea id="c-bodies" rows={2} value={f.professionalBodies} onChange={(e) => set('professionalBodies', e.target.value)} />
          </Field>
          <Field label="Outlook" htmlFor="c-outlook" optional>
            <Textarea id="c-outlook" rows={2} value={f.outlook} onChange={(e) => set('outlook', e.target.value)} />
          </Field>
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ courses

export function RequirementsCell({ c }: { c: Pick<CourseRow, 'utmeSubjects' | 'olevelRequirements'> }) {
  if (!c.utmeSubjects.length && !c.olevelRequirements) return <span className="text-muted-foreground">Not entered</span>;
  return (
    <div className="min-w-0 space-y-0.5 text-[12.5px]">
      {c.utmeSubjects.length > 0 && <p className="truncate">UTME: English · {c.utmeSubjects.map((r) => r.subjects.join('/')).join(' · ')}</p>}
      {c.olevelRequirements && <p className="truncate text-muted-foreground">{formatOlevel(c.olevelRequirements)}</p>}
    </div>
  );
}

function CoursesTab({ onEdit }: { onEdit: (c: CourseRow) => void }) {
  const q = useConsoleCourses();
  const del = useDeleteConsoleCourse();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>();
  const [deleting, setDeleting] = useState<CourseRow | null>(null);
  const s = useDebounced(search.trim().toLowerCase(), 200);
  const rows = q.data?.filter(
    (c) =>
      (!s || `${c.name} ${c.faculty ?? ''}`.toLowerCase().includes(s)) &&
      (!status || (status === 'VERIFIED' ? c.verified : status === 'EMPTY' ? !c.utmeSubjects.length && !c.olevelRequirements : !c.verified && (c.utmeSubjects.length > 0 || !!c.olevelRequirements))),
  );
  const verified = q.data?.filter((c) => c.verified).length ?? 0;
  const columns: Column<CourseRow>[] = [
    {
      key: 'name',
      header: 'Course',
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium">{c.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{[c.faculty, c.careers ? `${c.careers} career${c.careers === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      ),
    },
    { key: 'req', header: 'Requirements', className: 'max-w-md', cell: (c) => <RequirementsCell c={c} /> },
    { key: 'source', header: 'Source', cell: (c) => <span className="text-[12.5px]">{c.source === 'JAMB_BROCHURE' ? 'JAMB brochure' : 'Manual'}{c.sourceEdition ? ` · ${c.sourceEdition}` : ''}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (c) =>
        c.verified ? (
          <Badge variant="success">
            <BadgeCheck /> Verified
          </Badge>
        ) : (
          <Badge variant="warning">
            <Clock /> Unverified
          </Badge>
        ),
    },
    { key: 'updated', header: 'Updated', cell: (c) => <span className="text-[12.5px] text-muted-foreground">{formatRelative(c.updatedAt)}</span> },
    {
      key: 'actions',
      header: '',
      className: 'w-14 text-right',
      cell: (c) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={(e) => (e.stopPropagation(), setDeleting(c))}>
          <Trash2 />
        </Button>
      ),
    },
  ];
  return (
    <Card className="overflow-hidden p-0">
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search courses…" label="Search courses" className="sm:w-72" />
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: 'VERIFIED', label: 'Verified' },
            { value: 'UNVERIFIED', label: 'Entered, not verified' },
            { value: 'EMPTY', label: 'No requirements yet' },
          ]}
          label="Status"
          allLabel="All courses"
          className="sm:w-56"
        />
        <span className="text-[12.5px] text-muted-foreground sm:ml-auto">{q.data ? `${verified} of ${q.data.length} verified` : ''}</span>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        onRowClick={onEdit}
        rowLabel={(c) => `Edit ${c.name}`}
        renderMobile={(c) => (
          <div className="min-w-0">
            <p className="font-medium">{c.name}</p>
            <p className="text-[12px] text-muted-foreground">{c.verified ? 'Verified' : 'Unverified'}{c.faculty ? ` · ${c.faculty}` : ''}</p>
          </div>
        )}
        empty={{ icon: GraduationCap, title: 'No courses yet', description: 'Add a course, import a CSV, or read the JAMB brochure.' }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'course'}?`}
        description="Careers that list it will show it without requirements."
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Course deleted');
              setDeleting(null);
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </Card>
  );
}

interface CourseForm {
  name: string;
  faculty: string;
  utme: [string, string, string];
  hasOlevel: boolean;
  count: string;
  required: string;
  anyOf: { count: string; subjects: string }[];
  olevelNote: string;
  notes: string;
  source: (typeof COURSE_SOURCES)[number];
  sourceEdition: string;
  verified: boolean;
  published: boolean;
}

const emptyCourse: CourseForm = { name: '', faculty: '', utme: ['', '', ''], hasOlevel: true, count: '5', required: 'English Language, Mathematics', anyOf: [], olevelNote: '', notes: '', source: 'JAMB_BROCHURE', sourceEdition: '', verified: false, published: true };
const alts = (s: string) => s.split(/\s*(?:\/|,|\bor\b)\s*/i).map((x) => x.trim()).filter(Boolean);

function CourseDialog({ course, onClose }: { course: CourseRow | 'new' | null; onClose: () => void }) {
  const save = useSaveConsoleCourse();
  const [f, setF] = useState<CourseForm>(emptyCourse);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!course) return;
    setErrors({});
    if (course === 'new') return setF(emptyCourse);
    const o = course.olevelRequirements;
    const u = course.utmeSubjects.map((r) => r.subjects.join(' or '));
    setF({
      name: course.name,
      faculty: course.faculty ?? '',
      utme: [u[0] ?? '', u[1] ?? '', u[2] ?? ''],
      hasOlevel: !!o,
      count: String(o?.count ?? 5),
      required: o?.required.join(', ') ?? 'English Language, Mathematics',
      anyOf: o?.anyOf.map((g) => ({ count: String(g.count), subjects: g.subjects.join(', ') })) ?? [],
      olevelNote: o?.note ?? '',
      notes: course.notes ?? '',
      source: course.source,
      sourceEdition: course.sourceEdition ?? '',
      verified: course.verified,
      published: course.published,
    });
  }, [course]);
  const set = <K extends keyof CourseForm>(k: K, v: CourseForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const body: CourseInput = {
      name: f.name,
      faculty: f.faculty,
      utmeSubjects: f.utme.filter((x) => x.trim()).map((x) => ({ subjects: alts(x) })),
      olevelRequirements: f.hasOlevel
        ? { count: Number(f.count) || 5, required: f.required.split(',').map((x) => x.trim()).filter(Boolean), anyOf: f.anyOf.filter((g) => g.subjects.trim()).map((g) => ({ count: Number(g.count) || 1, subjects: alts(g.subjects) })), note: f.olevelNote }
        : null,
      notes: f.notes,
      source: f.source,
      sourceEdition: f.sourceEdition,
      verified: f.verified,
      published: f.published,
    };
    const parsed = courseSchema.safeParse(body);
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    if (f.verified && !body.utmeSubjects?.length) return setErrors({ form: 'Enter the UTME subjects before marking the course verified.' });
    save.mutate(
      { id: course && course !== 'new' ? course.id : undefined, body },
      {
        onSuccess: () => {
          toast.success('Course saved');
          onClose();
        },
        onError: (err) => setErrors({ ...apiFieldErrors(err), form: errorMessage(err) }),
      },
    );
  };
  return (
    <FormDialog
      open={!!course}
      onOpenChange={(o) => !o && onClose()}
      title={course === 'new' ? 'New course' : 'Course requirements'}
      description="Type requirements exactly as the JAMB brochure prints them. Students see them only once verified."
      icon={<GraduationCap />}
      submitLabel="Save"
      pending={save.isPending}
      onSubmit={submit}
      size="xl"
    >
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course" htmlFor="u-name" error={errors.name}>
            <Input id="u-name" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Faculty" htmlFor="u-fac" optional>
            <Input id="u-fac" value={f.faculty} onChange={(e) => set('faculty', e.target.value)} />
          </Field>
        </div>
        <fieldset className="grid gap-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-[13px] font-semibold">UTME subjects</legend>
          <p className="text-[12.5px] text-muted-foreground">1. Use of English (always compulsory)</p>
          {f.utme.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 text-[12.5px] text-muted-foreground">{i + 2}.</span>
              <Input value={v} aria-label={`UTME subject ${i + 2}`} placeholder={i === 2 ? 'e.g. Physics or Mathematics' : 'e.g. Biology'} onChange={(e) => set('utme', f.utme.map((x, j) => (j === i ? e.target.value : x)) as CourseForm['utme'])} />
            </div>
          ))}
          <p className="text-[11.5px] text-muted-foreground">Alternatives in one slot: separate with “or” or “/”.</p>
        </fieldset>
        <fieldset className="grid gap-3 rounded-xl border border-border p-3">
          <legend className="px-1 text-[13px] font-semibold">O’level (WASSCE/NECO) credits</legend>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={f.hasOlevel} onCheckedChange={(v) => set('hasOlevel', v === true)} /> Enter O’level requirements
          </label>
          {f.hasOlevel && (
            <>
              <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
                <Field label="Credits" htmlFor="u-count">
                  <Input id="u-count" type="number" min={1} max={9} value={f.count} onChange={(e) => set('count', e.target.value)} />
                </Field>
                <Field label="Required subjects" htmlFor="u-req" hint="Comma-separated">
                  <Input id="u-req" value={f.required} onChange={(e) => set('required', e.target.value)} />
                </Field>
              </div>
              {f.anyOf.map((g, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Field label="Any" htmlFor={`u-any-${i}`} className="w-20">
                    <Input id={`u-any-${i}`} type="number" min={1} max={5} value={g.count} onChange={(e) => set('anyOf', f.anyOf.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))} />
                  </Field>
                  <Field label="of these subjects" htmlFor={`u-anys-${i}`} className="min-w-0 flex-1">
                    <Input id={`u-anys-${i}`} value={g.subjects} placeholder="Chemistry, Physics, Agricultural Science" onChange={(e) => set('anyOf', f.anyOf.map((x, j) => (j === i ? { ...x, subjects: e.target.value } : x)))} />
                  </Field>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove group" onClick={() => set('anyOf', f.anyOf.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set('anyOf', [...f.anyOf, { count: '1', subjects: '' }])}>
                <Plus /> Add “any of” group
              </Button>
              <Field label="O’level note" htmlFor="u-onote" optional>
                <Input id="u-onote" value={f.olevelNote} onChange={(e) => set('olevelNote', e.target.value)} />
              </Field>
            </>
          )}
        </fieldset>
        <Field label="Notes" htmlFor="u-notes" optional hint="Direct entry, special remarks, institution-specific exceptions">
          <Textarea id="u-notes" rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Source" htmlFor="u-src">
            <Select value={f.source} onValueChange={(v) => set('source', v as CourseForm['source'])}>
              <SelectTrigger id="u-src">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="JAMB_BROCHURE">JAMB brochure</SelectItem>
                <SelectItem value="MANUAL">Manual entry</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Brochure edition" htmlFor="u-ed" optional hint="e.g. 2026/2027">
            <Input id="u-ed" value={f.sourceEdition} onChange={(e) => set('sourceEdition', e.target.value)} />
          </Field>
        </div>
        <SwitchRow label="Verified against the JAMB brochure" description="I have checked every subject against the official brochure. Students will see these requirements.">
          <Switch checked={f.verified} onCheckedChange={(v) => set('verified', v)} aria-label="Verified" />
        </SwitchRow>
        <SwitchRow label="Published" description="Listed in the target-course picker">
          <Switch checked={f.published} onCheckedChange={(v) => set('published', v)} aria-label="Published" />
        </SwitchRow>
      </div>
    </FormDialog>
  );
}

