import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { ConversationRow, MessageRow, ProfileRow, Role } from '@/types/database';

interface ConvoWithMeta extends ConversationRow {
  title: string;
  last_message: string | null;
  last_at: string | null;
  unread: boolean;
  participant_names: string[];
}

interface MessageWithSender extends MessageRow {
  profiles: Pick<ProfileRow, 'name' | 'photo_url'> | null;
}

// DM permission matrix from spec
const DM_ALLOWED: Record<Role, Role[]> = {
  gentleman: ['captain', 'headmaster'],
  captain: ['gentleman', 'captain', 'headmaster', 'officer'],
  headmaster: ['gentleman', 'captain', 'headmaster', 'officer'],
  officer: ['captain', 'headmaster', 'officer'],
  alumni: [],
};

export default function MessagesPage() {
  const { user, role } = useAuth();
  const uid = user?.id;

  const [convos, setConvos] = useState<ConvoWithMeta[]>([]);
  const [activeConvo, setActiveConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewDm, setShowNewDm] = useState(false);
  const [dmTargets, setDmTargets] = useState<ProfileRow[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (uid) loadConversations(); }, [uid]);
  useEffect(() => { if (activeConvo) loadMessages(activeConvo); }, [activeConvo]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Realtime subscription
  useEffect(() => {
    if (!activeConvo) return;
    const channel = supabase
      .channel(`messages:${activeConvo}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConvo}` },
        (payload) => {
          const msg = payload.new as MessageRow;
          // Fetch sender profile
          supabase.from('profiles').select('name, photo_url').eq('id', msg.sender_id).single().then(({ data }) => {
            setMessages((prev) => [...prev, { ...msg, profiles: data } as MessageWithSender]);
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConvo]);

  async function loadConversations() {
    setLoading(true);

    const { data: participations } = await supabase
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', uid!);

    if (!participations || participations.length === 0) { setConvos([]); setLoading(false); return; }

    const convoIds = participations.map((p) => p.conversation_id);
    const readMap = new Map(participations.map((p) => [p.conversation_id, p.last_read_at]));

    const { data: convoData } = await supabase
      .from('conversations')
      .select('*')
      .in('id', convoIds);

    if (!convoData) { setConvos([]); setLoading(false); return; }

    // Get all participants for naming
    const { data: allParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', convoIds);

    const participantUserIds = [...new Set(allParticipants?.map((p) => p.user_id) ?? [])];
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', participantUserIds);

    const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p.name ?? 'Unnamed']));

    // Get last message per convo
    const { data: lastMessages } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', convoIds)
      .order('created_at', { ascending: false });

    const lastMsgMap = new Map<string, { content: string; created_at: string }>();
    for (const m of lastMessages ?? []) {
      if (!lastMsgMap.has(m.conversation_id)) lastMsgMap.set(m.conversation_id, m);
    }

    // Get squad/cohort names
    const squadIds = convoData.filter((c) => c.squad_id).map((c) => c.squad_id!);
    const cohortIds = convoData.filter((c) => c.cohort_id && c.type === 'cohort').map((c) => c.cohort_id!);

    const { data: squads } = squadIds.length > 0 ? await supabase.from('squads').select('id, name').in('id', squadIds) : { data: [] };
    const { data: cohorts } = cohortIds.length > 0 ? await supabase.from('cohorts').select('id, name').in('id', cohortIds) : { data: [] };

    const squadMap = new Map((squads ?? []).map((s) => [s.id, s.name]));
    const cohortMap = new Map((cohorts ?? []).map((c) => [c.id, c.name]));

    const enriched: ConvoWithMeta[] = convoData.map((c) => {
      const participants = (allParticipants ?? []).filter((p) => p.conversation_id === c.id && p.user_id !== uid);
      const names = participants.map((p) => profileMap.get(p.user_id) ?? 'Unknown');
      const lastMsg = lastMsgMap.get(c.id);
      const lastRead = readMap.get(c.id);
      const unread = lastMsg ? (!lastRead || new Date(lastMsg.created_at) > new Date(lastRead)) : false;

      let title = '';
      if (c.type === 'dm') title = names.join(', ') || 'Direct Message';
      else if (c.type === 'squad') title = squadMap.get(c.squad_id!) ?? 'Squad Chat';
      else if (c.type === 'cohort') title = cohortMap.get(c.cohort_id!) ?? 'Cohort Chat';
      else if (c.type === 'announcement') title = 'Announcements';

      return {
        ...c,
        title,
        last_message: lastMsg?.content?.slice(0, 60) ?? null,
        last_at: lastMsg?.created_at ?? c.created_at,
        unread,
        participant_names: names,
      };
    });

    enriched.sort((a, b) => new Date(b.last_at ?? 0).getTime() - new Date(a.last_at ?? 0).getTime());
    setConvos(enriched);
    setLoading(false);
  }

  async function loadMessages(convoId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles!messages_sender_id_fkey(name, photo_url)')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true })
      .limit(100);

    setMessages((data as MessageWithSender[]) ?? []);

    // Mark as read
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', convoId)
      .eq('user_id', uid!);
  }

  async function sendMessage() {
    if (!draft.trim() || !activeConvo || sending) return;
    setSending(true);

    await supabase.from('messages').insert({
      conversation_id: activeConvo,
      sender_id: uid!,
      content: draft.trim(),
    });

    setDraft('');
    setSending(false);
  }

  async function startNewDm() {
    if (!role) return;
    const allowedRoles = DM_ALLOWED[role] ?? [];
    if (allowedRoles.length === 0) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', allowedRoles)
      .neq('id', uid!)
      .order('name');

    setDmTargets(data ?? []);
    setShowNewDm(true);
  }

  async function createDm(targetId: string) {
    // Check if DM already exists
    const { data: myConvos } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', uid!);

    if (myConvos) {
      for (const mc of myConvos) {
        const { data: convo } = await supabase
          .from('conversations')
          .select('id, type')
          .eq('id', mc.conversation_id)
          .eq('type', 'dm')
          .maybeSingle();

        if (convo) {
          const { data: otherP } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', convo.id)
            .eq('user_id', targetId)
            .maybeSingle();

          if (otherP) {
            setActiveConvo(convo.id);
            setShowNewDm(false);
            return;
          }
        }
      }
    }

    // Create new DM
    const { data: newConvo } = await supabase
      .from('conversations')
      .insert({ type: 'dm' })
      .select()
      .single();

    if (newConvo) {
      await supabase.from('conversation_participants').insert([
        { conversation_id: newConvo.id, user_id: uid! },
        { conversation_id: newConvo.id, user_id: targetId },
      ]);
      setActiveConvo(newConvo.id);
      await loadConversations();
    }
    setShowNewDm(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const activeConvoData = convos.find((c) => c.id === activeConvo);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading messages…</div></div>;

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-0 overflow-hidden rounded-lg border border-ink-line">
      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-ink-line bg-ink-soft">
        <div className="flex items-center justify-between border-b border-ink-line px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Messages</span>
          <button className="text-xs text-brass hover:text-brass-dim" onClick={startNewDm}>+ New</button>
        </div>
        <div className="overflow-y-auto" style={{ height: 'calc(100% - 49px)' }}>
          {convos.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">No conversations yet.</div>
          ) : (
            convos.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveConvo(c.id)}
                className={`w-full border-b border-ink-line px-4 py-3 text-left transition ${activeConvo === c.id ? 'bg-ink' : 'hover:bg-ink/50'}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${c.unread ? 'font-medium text-slate-100' : 'text-slate-300'}`}>{c.title}</span>
                  <TypeBadge type={c.type} />
                </div>
                {c.last_message && <div className="mt-0.5 truncate text-xs text-slate-500">{c.last_message}</div>}
                {c.last_at && <div className="mt-0.5 text-xs text-slate-600">{timeAgo(c.last_at)}</div>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col bg-ink">
        {!activeConvo ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Select a conversation or start a new one.</div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-ink-line px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-100">{activeConvoData?.title}</div>
                <div className="text-xs text-slate-500">{activeConvoData?.type} · {activeConvoData?.participant_names.length} participant{activeConvoData?.participant_names.length !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">No messages yet. Say something.</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isMe = m.sender_id === uid;
                    return (
                      <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-lg px-3 py-2 ${isMe ? 'bg-brass/15 text-slate-100' : 'bg-ink-soft text-slate-200'}`}>
                          {!isMe && <div className="mb-0.5 text-xs font-medium text-brass">{m.profiles?.name ?? 'Unknown'}</div>}
                          <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                          <div className={`mt-1 text-xs ${isMe ? 'text-brass/50' : 'text-slate-600'}`}>{timeShort(m.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-ink-line px-4 py-3">
              <div className="flex gap-2">
                <textarea
                  className="input flex-1 resize-none"
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message…"
                />
                <button className="btn-primary text-xs" onClick={sendMessage} disabled={!draft.trim() || sending}>
                  {sending ? '…' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* New DM Modal */}
      {showNewDm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNewDm(false)}>
          <div className="w-full max-w-sm rounded-lg border border-ink-line bg-ink-soft p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg">New Direct Message</h3>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {dmTargets.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">No contacts available.</div>
              ) : (
                dmTargets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => createDm(t.id)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-ink"
                  >
                    <div className="h-8 w-8 rounded-full bg-ink-line" />
                    <div>
                      <div className="text-sm text-slate-200">{t.name ?? 'Unnamed'}</div>
                      <div className="text-xs text-slate-500 capitalize">{t.role}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <button className="btn mt-4 w-full text-xs" onClick={() => setShowNewDm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    dm: 'text-blue-400',
    squad: 'text-emerald-400',
    cohort: 'text-brass',
    announcement: 'text-yellow-400',
  };
  return <span className={`text-xs ${styles[type] ?? 'text-slate-500'}`}>{type === 'dm' ? 'DM' : type}</span>;
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const dy = Math.floor(h / 24);
  if (dy < 7) return `${dy}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
