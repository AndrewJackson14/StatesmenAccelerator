import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';

type ShipStatus = 'pending' | 'ordered' | 'shipped' | 'delivered' | 'returned';

interface ShipmentRow {
  id: string;
  user_id: string;
  purchased_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: ShipStatus;
  notes: string | null;
  profiles: { name: string | null; email: string | null; location: string | null } | null;
}

export default function BookShipmentQueuePage() {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ShipStatus | 'all'>('pending');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('book_shipments')
      .select('*, profiles!book_shipments_user_id_fkey(name, email, location)')
      .order('purchased_at', { ascending: true });
    setShipments((data as ShipmentRow[]) ?? []);
    setLoading(false);
  }

  async function updateShipment(id: string, updates: Partial<ShipmentRow>) {
    await supabase
      .from('book_shipments')
      .update({ ...updates, shipped_by: user?.id })
      .eq('id', id);
    load();
  }

  const filtered = shipments.filter((s) => filter === 'all' || s.status === filter);
  const counts = (['pending', 'ordered', 'shipped', 'delivered'] as ShipStatus[]).reduce(
    (acc, k) => ({ ...acc, [k]: shipments.filter((s) => s.status === k).length }),
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Book Shipment Queue</h1>
        <p className="mt-1 text-sm text-slate-400">
          Ship the foundational book to each prospect after their PDP payment clears.
        </p>
      </div>

      <div className="flex gap-2 border-b border-ink-line">
        {(['pending', 'ordered', 'shipped', 'delivered', 'all'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-4 py-2 text-sm transition ${
              filter === k
                ? 'border-b-2 border-brass text-brass'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {k} {k !== 'all' && `(${counts[k] ?? 0})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-line py-10 text-center text-sm text-slate-500">
          No shipments in this view.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <ShipmentCard key={s.id} shipment={s} onUpdate={updateShipment} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShipmentCard({
  shipment,
  onUpdate,
}: {
  shipment: ShipmentRow;
  onUpdate: (id: string, updates: Partial<ShipmentRow>) => void;
}) {
  const [carrier, setCarrier] = useState(shipment.carrier ?? '');
  const [tracking, setTracking] = useState(shipment.tracking_number ?? '');
  const [trackingUrl, setTrackingUrl] = useState(shipment.tracking_url ?? '');
  const [notes, setNotes] = useState(shipment.notes ?? '');

  function markOrdered() {
    onUpdate(shipment.id, { status: 'ordered', notes });
  }

  function markShipped() {
    onUpdate(shipment.id, {
      status: 'shipped',
      shipped_at: new Date().toISOString(),
      carrier: carrier || null,
      tracking_number: tracking || null,
      tracking_url: trackingUrl || null,
      notes,
    });
  }

  function markDelivered() {
    onUpdate(shipment.id, {
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-medium text-slate-100">
            {shipment.profiles?.name ?? 'Unnamed'}
          </div>
          <div className="text-xs text-slate-500">
            {shipment.profiles?.email}
            {shipment.profiles?.location && ` · ${shipment.profiles.location}`}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Purchased {new Date(shipment.purchased_at).toLocaleDateString()}
          </div>
        </div>
        <StatusBadge status={shipment.status} />
      </div>

      {shipment.status !== 'delivered' && (
        <div className="space-y-3 border-t border-ink-line pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Carrier</label>
              <input
                className="input text-sm"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="USPS, UPS, Amazon"
              />
            </div>
            <div>
              <label className="label">Tracking #</label>
              <input
                className="input text-sm"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Tracking URL</label>
              <input
                className="input text-sm"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <input
              className="input text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., KDP order #1234, shipped from office"
            />
          </div>
          <div className="flex gap-2">
            {shipment.status === 'pending' && (
              <button className="btn text-xs" onClick={markOrdered}>
                Mark Ordered
              </button>
            )}
            {(shipment.status === 'pending' || shipment.status === 'ordered') && (
              <button className="btn-primary text-xs" onClick={markShipped}>
                Mark Shipped
              </button>
            )}
            {shipment.status === 'shipped' && (
              <button className="btn-primary text-xs" onClick={markDelivered}>
                Mark Delivered
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ShipStatus }) {
  const color =
    status === 'delivered'
      ? 'bg-emerald-500/10 text-emerald-400'
      : status === 'shipped'
      ? 'bg-brass/10 text-brass'
      : status === 'ordered'
      ? 'bg-blue-500/10 text-blue-400'
      : status === 'returned'
      ? 'bg-red-500/10 text-red-400'
      : 'bg-slate-500/10 text-slate-400';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>;
}
