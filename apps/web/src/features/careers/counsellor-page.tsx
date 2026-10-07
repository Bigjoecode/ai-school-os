import { languageInfo } from '@aischool/shared';
import type { AllowanceExhausted } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, AudioLines, BookmarkCheck, Compass, GraduationCap, History, Loader2, MessageCircleHeart, MessageSquarePlus, Route, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Markdown } from '@/components/ai/markdown';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, safeStorage } from '@/lib/utils';
import { allowanceError, lk, useLearnHome, useTutorVoice } from '../learning/api';
import { UpgradeCard } from '../learning/components';
import { canSynthesise, micMode, setVoiceLanguage, speaker, unlockAudio } from '../learning/voice';
import { ListenButton, MicButton, RecordingStrip, TalkPanel, useVoiceInput, VoiceRepliesToggle, type AskResult } from '../learning/voice-ui';
import { crk, useCounsellorChat, useCounsellorConversation, useCounsellorConversations, type CounsellorConversation } from './api';

const STARTERS = [
  { icon: Compass, text: 'Which careers might suit me, based on my interests and results?' },
  { icon: Route, text: 'Should I choose Science, Arts, Commercial or Technical in SS1?' },
  { icon: GraduationCap, text: 'What can I do now to prepare for JAMB and university?' },
  { icon: Sparkles, text: 'I like computers and drawing. What jobs combine both?' },
];
const VOICE_REPLIES_KEY = 'aischool:counsellor-voice-replies';
/** Careers saved during a reply, keyed by the local reply id (kept outside the component so they survive the URL change). */
const savedByReply = new Map<string, string[]>();

/** The AI careers counsellor: the tutor's chat and voice, with a counsellor's brief. */
export default function CounsellorPage() {
  useDocumentTitle('AI careers counsellor');
  const { conversationId: routeId } = useParams();
  const [params, setParams] = useSearchParams();
  const [talkConvoId, setTalkConvoId] = useState<string | null>(null);
  const conversationId = routeId ?? talkConvoId ?? undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const home = useLearnHome();
  const access = home.data?.access;
  const list = useCounsellorConversations();
  const convo = useCounsellorConversation(conversationId);
  const chat = useCounsellorChat();

  const [text, setText] = useState(() => params.get('ask') ?? '');
  const [pending, setPending] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<AllowanceExhausted | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [, bump] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // A starter question from another page (?ask=…) lands in the box, ready to send.
  useEffect(() => {
    if (params.get('ask')) {
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.delete('ask');
        return n;
      }, { replace: true });
      setTimeout(() => input.current?.focus(), 50);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const voiceInfo = useTutorVoice();
  const voiceReady = voiceInfo.isSuccess || voiceInfo.isError;
  const server = !!voiceInfo.data?.server;
  const voice = useVoiceInput(voiceReady ? micMode(server) : null, null);
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

  useEffect(() => () => speaker.stop(), []);
  // The counsellor replies in the student's tutor language; the browser's speech listens for it too.
  const tutorLanguage = home.data?.tutorLanguage;
  useEffect(() => setVoiceLanguage(languageInfo(tutorLanguage).speech), [tutorLanguage]);
  useEffect(() => {
    setBlocked(null);
    setPending(null);
  }, [conversationId]);

  const messages = conversationId ? (convo.data?.messages ?? []) : [];
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending, blocked]);

  const send = (message: string, opts: { voice?: boolean; speak?: boolean } = {}): Promise<AskResult> => {
    const body = message.trim();
    if (!body || chat.isPending) return Promise.resolve(null);
    speaker.stop();
    const spoken = !!opts.voice || voiceRepliesRef.current;
    setPending(body);
    setBlocked(null);
    setText('');
    return new Promise<AskResult>((resolve) =>
      chat.mutate(
        { conversationId: conversationId ?? null, message: body, ...(spoken ? { voice: true } : {}) },
        {
          onSuccess: (r) => {
            const now = new Date().toISOString();
            const replyId = `local-${Date.now()}`;
            const prev = qc.getQueryData<CounsellorConversation>(crk.conversation(r.conversationId));
            qc.setQueryData<CounsellorConversation>(crk.conversation(r.conversationId), {
              id: r.conversationId,
              title: prev?.title ?? body.slice(0, 80),
              messages: [...(prev?.messages ?? []), { id: `${replyId}-q`, role: 'user', content: body, createdAt: now }, { id: replyId, role: 'assistant', content: r.reply, createdAt: now }],
            });
            if (r.savedCareers.length) savedByReply.set(replyId, r.savedCareers);
            bump((n) => n + 1);
            setPending(null);
            if (!conversationId) {
              if (talkOpenRef.current) setTalkConvoId(r.conversationId);
              else navigate(`/careers/counsellor/${r.conversationId}`, { replace: true });
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
  const closeTalk = () => {
    setTalkOpen(false);
    if (!routeId && talkConvoId) navigate(`/careers/counsellor/${talkConvoId}`, { replace: true });
  };

  const conversationsList = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => {
            setListOpen(false);
            navigate('/careers/counsellor');
            setTimeout(() => input.current?.focus(), 50);
          }}
        >
          <MessageSquarePlus /> New chat
        </Button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {list.isLoading ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !list.data?.length ? (
          <p className="px-3 py-4 text-[12.5px] text-muted-foreground">Your chats with the counsellor will appear here.</p>
        ) : (
          <ul className="space-y-0.5">
            {list.data.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/careers/counsellor/${c.id}`}
                  onClick={() => setListOpen(false)}
                  aria-current={c.id === conversationId ? 'page' : undefined}
                  className={cn('block rounded-lg px-3 py-2 transition-colors hover:bg-muted', c.id === conversationId && 'bg-muted')}
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
          <Link to="/careers" className="px-4 pt-4 text-[12px] font-medium text-muted-foreground hover:text-foreground">
            ← Careers
          </Link>
          {conversationsList}
        </aside>
        <Sheet open={listOpen} onOpenChange={setListOpen}>
          <SheetContent side="left" className="pt-12">
            <SheetTitle className="px-4 text-[13px] font-semibold">Your chats</SheetTitle>
            {conversationsList}
          </SheetContent>
        </Sheet>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft" aria-label="Chat with the careers counsellor">
          <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
            <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setListOpen(true)} aria-label="Your chats">
              <History />
            </Button>
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-ai-gradient text-white">
              <MessageCircleHeart className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[14px] font-semibold tracking-tight">{conversationId ? (convo.data?.title ?? 'Careers counsellor') : 'AI careers counsellor'}</p>
              {access && <p className="truncate text-[11.5px] text-muted-foreground">Uses your AI learning · {access.remainingPct}% left</p>}
            </div>
            {voice.mode && (
              <Button type="button" variant="ai" size="sm" className="px-2.5" onClick={openTalk} aria-label="Talk to the counsellor">
                <AudioLines /> Talk
              </Button>
            )}
            {canSpeak && <VoiceRepliesToggle on={voiceReplies} onChange={setVoiceReplies} />}
          </header>

          <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
            {empty ? (
              <div className="mx-auto flex max-w-xl flex-col items-center pt-4 text-center sm:pt-10">
                <div className="grid size-14 place-items-center rounded-2xl bg-ai-gradient text-white">
                  <MessageCircleHeart className="size-6" aria-hidden />
                </div>
                <h1 className="mt-4 font-display text-xl font-semibold tracking-tight sm:text-2xl">Let’s talk about your future</h1>
                <p className="mt-1.5 text-[14px] text-muted-foreground">I know your interest results, your subjects and your saved careers. Ask me anything about careers, tracks, JAMB and university.</p>
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
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <li key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[14px] text-primary-foreground">{m.content}</div>
                    </li>
                  ) : (
                    <li key={m.id} className="flex gap-2.5">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-ai-gradient text-white">
                        <MessageCircleHeart className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <Markdown text={m.content} className="break-words" />
                        {canSpeak && (
                          <div className="-ml-1.5 -mt-1">
                            <ListenButton id={m.id} text={m.content} server={server} />
                          </div>
                        )}
                        {savedByReply.get(m.id)?.map((slug) => (
                          <Link key={slug} to={`/careers/library/${slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-ai-2/25 bg-ai-2/5 px-2.5 py-1 text-[12px] font-medium hover:bg-ai-2/10">
                            <BookmarkCheck className="size-3.5 text-ai-2" aria-hidden /> Saved to your careers
                          </Link>
                        ))}
                      </div>
                    </li>
                  ),
                )}
                {pending && (
                  <>
                    <li className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[14px] text-primary-foreground">{pending}</div>
                    </li>
                    <li className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
                      <Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…
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
                placeholder="Ask about careers, tracks, JAMB or university…"
                aria-label="Message the counsellor"
                className={cn('block max-h-40 w-full resize-none bg-transparent px-3 pt-2.5 text-[14px] outline-none placeholder:text-muted-foreground', voice.state !== 'idle' && !talkOpen && 'hidden')}
              />
              <div className="flex items-center gap-1.5 px-2 pb-2">
                {voice.mode && <MicButton voice={voice} onTap={() => void onMic()} disabled={chat.isPending || talkOpen} className="ml-auto" />}
                <Button type="submit" size="icon-sm" className={cn('rounded-lg', !voice.mode && 'ml-auto')} disabled={chat.isPending || !text.trim()} aria-label="Send">
                  {chat.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
                </Button>
              </div>
            </div>
            <p className="mt-1.5 px-1 text-center text-[11px] text-muted-foreground">The counsellor can make mistakes. Always check admission requirements and cut-off marks in the JAMB brochure and with your school counsellor.</p>
          </form>
        </section>
      </div>
      {voice.mode && <TalkPanel open={talkOpen} onClose={closeTalk} voice={voice} server={server} ask={(t) => send(t, { voice: true, speak: false })} blocked={blocked} who="counsellor" />}
    </Page>
  );
}
