import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { NotificationRow } from '@/types/database';

export default function NotificationsDropdown() {
  const { user } = useAuth();
  const uid = user?.id;
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { if (uid) loadNotifications(); }, [uid]);

  // Realtime
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload) => {
          const n = payload.new as NotificationRow;
          setNotifications((prev) => [n, ...prev].slice(0, 20));
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [uid]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid!)
      .order('created_at', { ascending: false })
      .limit(20);

    setNotifications(data ?? []);
    setUnreadCount(data?.filter((n) => !n.read_at).length ?? 0);
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);

    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-md p-1.5 text-slate-400 transition hover:text-slate-100">
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-ink-line bg-ink-soft shadow-xl">
          <div className="flex items-center justify-between border-b border-ink-line px-4 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Notifications</span>
            {unreadCount > 0 && (
              <button className="text-xs text-brass hover:text-brass-dim" onClick={markAllRead}>Mark all read</button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">No notifications yet.</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { if (!n.read_at) markRead(n.id); }}
                  className={`w-full border-b border-ink-line px-4 py-3 text-left transition last:border-0 hover:bg-ink ${!n.read_at ? 'bg-ink/30' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brass" />}
                    <div className={!n.read_at ? '' : 'pl-4'}>
                      <div className={`text-sm ${!n.read_at ? 'font-medium text-slate-100' : 'text-slate-300'}`}>{n.title}</div>
                      {n.body && <div className="mt-0.5 text-xs text-slate-500">{n.body}</div>}
                      <div className="mt-1 text-xs text-slate-600">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  if (dy < 7) return `${dy}d ago`;
  return new Date(iso).toLocaleDateString();
}
