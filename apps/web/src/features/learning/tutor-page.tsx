import { TIER_POLICY, type AllowanceExhausted, type TutorReply } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, AudioLines, Brain, CalendarCheck2, Camera, History, Layers, Loader2, MessageSquarePlus, Sparkles, Target, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Markdown } from '@/components/ai/markdown';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { formatRelative } from '@/lib/format';
import { cn, safeStorage } from '@/lib/utils';
import { allowanceError, lk, uploadQuestionPhoto, useConversation, useConversations, useLearnHome, useMastery, useTutorChat, useTutorVoice, type ConversationDetail } from './api';
import { TierBadge, UpgradeCard } from './components';
import { canSynthesise, micMode, speaker, unlockAudio } from './voice';
import { ListenButton, MicButton, RecordingStrip, TalkPanel, useVoiceInput, VoiceRepliesToggle, type AskResult } from './voice-ui';

const ANY = '__any__';
const FALLBACK_SUBJECTS = ['Mathematics', 'English Language', 'Basic Science', 'Physics', 'Chemistry', 'Biology', 'Economics'];
const STARTERS = [
  { icon: Target, text: 'Explain how to solve linear equations, step by step' },
  { icon: Brain, text: 'I keep getting fractions wrong. Can you help me understand why?' },
  { icon: Zap, text: 'Give me a quick 5-question quiz on my weakest topic' },
  { icon: CalendarCheck2, text: 'Help me plan revision for my mid-term tests' },
];

type Saved = TutorReply['savedItems'][number];
interface Extra {
  saved: Saved[];
  deep: boolean;
}

function savedLink(s: Saved): string {
  switch (s.kind) {
    case 'QUIZ':
      return s.id ? `/learn/attempts/${s.id}` : '/learn/exams';
    case 'STUDY_PLAN':
      return s.id ? `/learn/plans?plan=${s.id}` : '/learn/plans';
    case 'FLASHCARDS':
      return s.id ? `/learn/flashcards?deck=${s.id}` : '/learn/flashcards';
    default:
      return '/learn/progress';
  }
}
const SAVED_ICON = { QUIZ: Target, STUDY_PLAN: CalendarCheck2, FLASHCARDS: Layers, MEMORY: Brain, MASTERY: Sparkles } as const;
const SAVED_VERB = { QUIZ: 'Take the quiz', STUDY_PLAN: 'Open plan', FLASHCARDS: 'Review cards', MEMORY: 'Remembered', MASTERY: 'Progress updated' } as const;

/** Saved items and the deep flag per reply, kept outside the component so they survive the route change to /learn/tutor/:id. */
const replyExtras = new Map<string, Extra>();

const VOICE_REPLIES_KEY = 'aischool:tutor-voice-replies';
/** Set just before the first reply moves a new chat to its own URL (which remounts this page): keep reading it. */
let keepSpeakingUntil = 0;

export default function TutorPage() {
  useDocumentTitle('AI tutor');
  const { conversationId: routeId } = useParams();
  // A new chat started in Talk mode keeps its id here until the panel closes:
  // changing the URL remounts the page, which would end the conversation.
  const [talkConvoId, setTalkConvoId] = useState<string | null>(null);
  const conversationId = routeId ?? talkConvoId ?? undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const home = useLearnHome();
  const access = home.data?.access;
  const list = useConversations();
  const convo = useConversation(conversationId);
  const mastery = useMastery();
  const chat = useTutorChat();

  const [text, setText] = useState('');
  const [deep, setDeep] = useState(false);
  const [subject, setSubject] = useState(ANY);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<AllowanceExhausted | null>(null);
  const [, bump] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Voice: server speech when connected, else the browser's own.
  const voiceInfo = useTutorVoice();
  const voiceReady = voiceInfo.isSuccess || voiceInfo.isError;
  const server = !!voiceInfo.data?.server;
  const voice = useVoiceInput(voiceReady ? micMode(server) : null, subject === ANY ? null : subject);
  const canSpeak = voiceReady && (server || canSynthesise());
  const [voiceReplies, setVoiceRepliesState] = useState(() => safeStorage().get(VOICE_REPLIES_KEY) === '1');
  const voiceRepliesRef = useRef(voiceReplies);
  voiceRepliesRef.current = voiceReplies;
  const setVoiceReplies = useCallback((on: boolean) => {
    setVoiceRepliesState(on);
    voiceRepliesRef.current = on;
    safeStorage().set(VOICE_REPLIES_KEY, on ? '1' : '0');
    if (!on) speaker.stop();
  }, []);
  const [talkOpen, setTalkOpen] = useState(false);
  const talkOpenRef = useRef(talkOpen);
  talkOpenRef.current = talkOpen;
  const closeTalk = () => {
    setTalkOpen(false);
    if (!routeId && talkConvoId) navigate(`/learn/tutor/${talkConvoId}`, { replace: true });
  };

  // Leaving the page (or the tab going away) silences the tutor.
  useEffect(() => {
    const hide = () => speaker.stop();
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      if (Date.now() > keepSpeakingUntil) speaker.stop();
    };
  }, []);

  // Pro answers deeply by default.
  const tier = access?.tier;
  useEffect(() => {
    if (tier && TIER_POLICY[tier].deepByDefault) setDeep(true);
  }, [tier]);

  useEffect(() => {
    setBlocked(null);
    setPending(null);
  }, [conversationId]);

  const subjects = useMemo(() => {
    const fromMap = mastery.data?.subjects.map((s) => s.subject) ?? [];
    return fromMap.length ? fromMap : FALLBACK_SUBJECTS;
  }, [mastery.data]);

  const messages = conversationId ? (convo.data?.messages ?? []) : [];
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending, blocked]);

  /**
   * Sends a message. `voice` asks for a short, speakable reply; `speak` reads
   * the reply aloud when voice replies are on (Talk mode reads it itself).
   */
  const send = (message: string, opts: { voice?: boolean; speak?: boolean } = {}): Promise<AskResult> => {
    const msg = message.trim();
    if ((!msg && photos.length === 0) || chat.isPending) return Promise.resolve(null);
    speaker.stop();
    const body = msg || 'Please help me with the question in this photo.';
    const spoken = !!opts.voice || voiceRepliesRef.current;
    setPending(body);
    setBlocked(null);
    setText('');
    return new Promise<AskResult>((resolve) =>
      chat.mutate(
        {
          conversationId: conversationId ?? null,
          message: body,
          deep: deep && !!access?.deepAllowed,
          imageFileIds: photos.map((p) => p.id),
          subject: subject === ANY ? null : subject,
          ...(spoken ? { voice: true } : {}),
        },
        {
          onSuccess: (r) => {
            const now = new Date().toISOString();
            const replyId = `local-${Date.now()}`;
            const prev = qc.getQueryData<ConversationDetail>(lk.conversation(r.conversationId));
            qc.setQueryData<ConversationDetail>(lk.conversation(r.conversationId), {
              id: r.conversationId,
              title: prev?.title ?? body.slice(0, 80),
              messages: [...(prev?.messages ?? []), { id: `${replyId}-q`, role: 'user', content: body, createdAt: now }, { id: replyId, role: 'assistant', content: r.reply, createdAt: now }],
            });
            replyExtras.set(replyId, { saved: r.savedItems, deep: r.deep });
            bump((n) => n + 1);
            setPhotos([]);
            setPending(null);
            if (!conversationId) {
              if (talkOpenRef.current) setTalkConvoId(r.conversationId);
              else {
                keepSpeakingUntil = Date.now() + 2000;
                navigate(`/learn/tutor/${r.conversationId}`, { replace: true });
              }
            }
            if (opts.speak !== false && voiceRepliesRef.current && canSpeak) void speaker.speak(replyId, r.reply, server);
            resolve({ id: replyId, reply: r.reply });
          },
          onError: (err) => {
            setPending(null);
            setText(body);
            const a = allowanceError(err);
            if (a) {
              setBlocked(a);
              qc.setQueryData(lk.home, (old: object | undefined) => (old && a.access ? { ...old, access: a.access } : old));
            } else toast.error(errorMessage(err));
            resolve(a ? 'blocked' : null);
          },
        },
      ),
    );
  };

  /** Composer mic: tap to talk, tap again to send. */
  const onMic = async () => {
    if (voice.state === 'listening') return voice.stop();
    if (voice.state !== 'idle') return;
    if (canSpeak && !voiceRepliesRef.current) setVoiceReplies(true);
    try {
      const heard = await voice.listen();
      if (heard) void send(heard, { voice: true });
      else if (heard === '') toast.info('I didn’t hear anything. Tap the microphone and speak a little louder.');
    } catch (err) {
      toast.error(errorMessage(err), { duration: 8000 });
    }
  };

  const openTalk = () => {
    unlockAudio();
    speaker.stop();
    voice.cancel();
    if (canSpeak && !voiceRepliesRef.current) setVoiceReplies(true);
    setTalkOpen(true);
  };

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const saved = await uploadQuestionPhoto(file);
      setPhotos((p) => [...p, { id: saved.id, url: URL.createObjectURL(file) }].slice(0, 3));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const conversationsList = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => {
            setListOpen(false);
            navigate('/learn/tutor');
            setTimeout(() => input.current?.focus(), 50);
          }}
        >
          <MessageSquarePlus /> New chat
        </Button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {list.isLoading ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !list.data?.length ? (
          <p className="px-3 py-4 text-[12.5px] text-muted-foreground">Your chats with the tutor will appear here.</p>
        ) : (
          <ul className="space-y-0.5">
            {list.data.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/learn/tutor/${c.id}`}
                  onClick={() => setListOpen(false)}
                  className={cn('block rounded-lg px-3 py-2 transition-colors hover:bg-muted', c.id === conversationId && 'bg-muted')}
                  aria-current={c.id === conversationId ? 'page' : undefined}
                >
                  <span className="block truncate text-[13px] font-medium">{c.title || 'Untitled chat'}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{formatRelative(c.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const empty = !conversationId && !pending;

  return (
    <Page className="flex h-[calc(100dvh-56px)] max-w-6xl flex-col !py-4 sm:!py-6">
      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card md:flex" aria-label="Your chats">
          <p className="px-4 pt-4 text-[12px] font-medium text-muted-foreground">Your chats</p>
          {conversationsList}
        </aside>
        <Sheet open={listOpen} onOpenChange={setListOpen}>
          <SheetContent side="left" className="pt-12">
            <SheetTitle className="px-4 text-[13px] font-semibold">Your chats</SheetTitle>
            {conversationsList}
          </SheetContent>
        </Sheet>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft" aria-label="Chat with your tutor">
          <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
            <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setListOpen(true)} aria-label="Your chats">
              <History />
            </Button>
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-ai-gradient text-white">
              <Sparkles className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[14px] font-semibold tracking-tight">{conversationId ? (convo.data?.title ?? 'Your tutor') : 'Your AI tutor'}</p>
              {access && <p className="truncate text-[11.5px] text-muted-foreground">{access.remainingPct}% of this term’s AI learning left</p>}
            </div>
            {access && <TierBadge access={access} className="hidden sm:inline-flex" />}
            {voice.mode && (
              <Button type="button" variant="ai" size="sm" className="px-2.5" onClick={openTalk} aria-label="Talk to your tutor" title="Talk to your tutor, hands-free">
                <AudioLines /> Talk
              </Button>
            )}
            {canSpeak && <VoiceRepliesToggle on={voiceReplies} onChange={setVoiceReplies} />}
          </header>

          <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
            {empty ? (
              <div className="mx-auto flex max-w-xl flex-col items-center pt-4 text-center sm:pt-10">
                <div className="grid size-14 place-items-center rounded-2xl bg-ai-gradient text-white shadow-[0_12px_32px_-12px_var(--ai-2)]">
                  <Sparkles className="size-6" aria-hidden />
                </div>
                <h1 className="mt-4 font-display text-xl font-semibold tracking-tight sm:text-2xl">What are we learning today?</h1>
                <p className="mt-1.5 text-[14px] text-muted-foreground">I’ll guide you to the answer step by step — not just hand it over. Ask anything from class or homework.</p>
                {voice.mode && (
                  <Button type="button" variant="ai" size="lg" className="mt-5 rounded-full" onClick={openTalk}>
                    <AudioLines /> Talk to your tutor
                  </Button>
                )}
                <div className="mt-6 grid w-full gap-2 sm:grid-cols-2 [&>*]:min-w-0">
                  {STARTERS.map((s) => (
                    <button
                      key={s.text}
                      type="button"
                      onClick={() => void send(s.text)}
                      className="flex items-start gap-2.5 rounded-xl border border-border bg-background/60 p-3 text-left text-[13px] transition-colors hover:border-border-strong hover:bg-muted/60"
                    >
                      <s.icon className="mt-0.5 size-4 shrink-0 text-ai-2" aria-hidden />
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : conversationId && convo.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <Skeleton className="h-24 w-4/5 rounded-2xl" />
              </div>
            ) : (
              <ol className="mx-auto max-w-3xl space-y-5">
                {messages.map((m) => (
                  <Message key={m.id} id={m.id} role={m.role} content={m.content} extra={replyExtras.get(m.id)} speak={canSpeak ? { server } : undefined} />
                ))}
                {pending && (
                  <>
                    <Message role="user" content={pending} />
                    <li className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
                      <span className="grid size-7 place-items-center rounded-lg bg-ai-gradient text-white">
                        <Sparkles className="size-3.5" aria-hidden />
                      </span>
                      <span className="flex gap-1" aria-label="Your tutor is thinking">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="size-1.5 animate-bounce rounded-full bg-ai-2/70" style={{ animationDelay: `${i * 140}ms` }} />
                        ))}
                      </span>
                      {deep && access?.deepAllowed ? 'Thinking it through carefully…' : 'Thinking…'}
                    </li>
                  </>
                )}
              </ol>
            )}
            {blocked && <UpgradeCard error={blocked} className="mx-auto mt-5 max-w-3xl" onClose={() => setBlocked(null)} />}
          </div>

          <form
            className="border-t border-border bg-background/40 p-2.5 sm:p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            {photos.length > 0 && (
              <div className="mb-2 flex gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="relative">
                    <img src={p.url} alt="Your question" className="size-14 rounded-lg border border-border object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}
                      className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background"
                      aria-label="Remove photo"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-xl border border-input bg-card focus-within:ring-2 focus-within:ring-ring/40">
              {voice.state !== 'idle' && !talkOpen && <RecordingStrip voice={voice} />}
              <textarea
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                rows={2}
                maxLength={4000}
                placeholder="Ask your tutor anything…"
                aria-label="Message your tutor"
                className={cn('block max-h-40 w-full resize-none bg-transparent px-3 pt-2.5 text-[14px] outline-none placeholder:text-muted-foreground', voice.state !== 'idle' && !talkOpen && 'hidden')}
              />
              <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger className="h-8 w-auto max-w-[44%] gap-1 border-0 bg-muted/70 text-[12.5px] shadow-none sm:max-w-none" aria-label="Subject">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any subject</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {access?.photos && (
                  <>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onPickPhoto(e.target.files?.[0])} aria-label="Attach a photo of your question" tabIndex={-1} />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} disabled={uploading || photos.length >= 3} aria-label="Attach a photo of your question" title="Photo of your question">
                      {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
                    </Button>
                  </>
                )}
                {access?.deepAllowed && (
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] text-muted-foreground hover:bg-muted" title={`Deeper explanations use ${access.deepCost}× as much of your AI learning`}>
                    <Switch checked={deep} onCheckedChange={setDeep} aria-label="Explain more deeply" />
                    <span>
                      Explain more deeply <span className="hidden text-[11.5px] sm:inline">· uses {access.deepCost}×</span>
                    </span>
                  </label>
                )}
                {voice.mode && <MicButton voice={voice} onTap={() => void onMic()} disabled={chat.isPending || talkOpen} className="ml-auto" />}
                <Button type="submit" size="icon-sm" className={cn('rounded-lg', !voice.mode && 'ml-auto')} disabled={chat.isPending || (!text.trim() && photos.length === 0)} aria-label="Send">
                  {chat.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
                </Button>
              </div>
            </div>
            <p className="mt-1.5 px-1 text-center text-[11px] text-muted-foreground">The tutor can make mistakes — check important answers with your teacher.</p>
          </form>
        </section>
      </div>
      {voice.mode && (
        <TalkPanel
          open={talkOpen}
          onClose={closeTalk}
          voice={voice}
          server={server}
          ask={(t) => send(t, { voice: true, speak: false })}
          blocked={blocked}
        />
      )}
    </Page>
  );
}

function Message({ id, role, content, extra, speak }: { id?: string; role: string; content: string; extra?: Extra; speak?: { server: boolean } }) {
  if (role === 'user') {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[14px] text-primary-foreground">{content}</div>
      </li>
    );
  }
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-ai-gradient text-white">
        <Sparkles className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        {extra?.deep && <span className="inline-flex items-center gap-1 rounded-full bg-ai-2/10 px-2 py-0.5 text-[11px] font-medium text-ai-2">Deeper explanation</span>}
        <Markdown text={content} className="break-words" />
        {speak && id && (
          <div className="-ml-1.5 -mt-1">
            <ListenButton id={id} text={content} server={speak.server} />
          </div>
        )}
        {extra && extra.saved.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {extra.saved.map((s, i) => {
              const Icon = SAVED_ICON[s.kind];
              return (
                <Link
                  key={`${s.kind}-${s.id ?? i}`}
                  to={savedLink(s)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ai-2/25 bg-ai-2/5 px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-ai-2/10"
                >
                  <Icon className="size-3.5 shrink-0 text-ai-2" aria-hidden />
                  <span className="truncate">{s.label}</span>
                  <span className="shrink-0 text-muted-foreground">· {SAVED_VERB[s.kind]}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}
