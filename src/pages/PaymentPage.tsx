import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { PaymentRow, DiscountCodeRow } from '@/types/database';

export default function PaymentPage() {
  const { user } = useAuth();
  const uid = user?.id;

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [discountCode, setDiscountCode] = useState('');
  const [discount, setDiscount] = useState<DiscountCodeRow | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const PROGRAM_PRICE_CENTS = 49900; // $499.00

  useEffect(() => { if (uid) loadPayments(); }, [uid]);

  async function loadPayments() {
    setLoading(true);
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', uid!)
      .order('created_at', { ascending: false });
    setPayments(data ?? []);
    setLoading(false);
  }

  async function applyDiscount() {
    if (!discountCode.trim()) return;
    setDiscountError(null);

    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', discountCode.trim().toUpperCase())
      .eq('active', true)
      .maybeSingle();

    if (error || !data) { setDiscountError('Invalid discount code.'); setDiscount(null); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setDiscountError('This code has expired.'); setDiscount(null); return; }
    if (data.max_uses !== null && data.used_count >= data.max_uses) { setDiscountError('This code has reached its usage limit.'); setDiscount(null); return; }

    setDiscount(data);
  }

  function calculateTotal(): number {
    if (!discount) return PROGRAM_PRICE_CENTS;
    if (discount.type === 'percent') return Math.round(PROGRAM_PRICE_CENTS * (1 - discount.value / 100));
    return Math.max(0, PROGRAM_PRICE_CENTS - Math.round(discount.value));
  }

  async function handlePayment() {
    const total = calculateTotal();

    // Create payment record (pending)
    const { data: payment, error } = await supabase.from('payments').insert({
      user_id: uid!,
      amount_cents: total,
      currency: 'usd',
      status: 'pending',
      discount_code: discount?.code ?? null,
    }).select().single();

    if (error || !payment) return;

    // In production: redirect to Stripe Checkout
    // For now, simulate by marking as paid
    // TODO: Replace with actual Stripe integration via Edge Function
    //
    // const { data: session } = await supabase.functions.invoke('create-checkout-session', {
    //   body: { payment_id: payment.id, amount: total, discount_code: discount?.code }
    // });
    // window.location.href = session.url;

    // Simulate successful payment for development
    await supabase.from('payments').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_id: `sim_${Date.now()}`,
    }).eq('id', payment.id);

    if (discount) {
      await supabase.from('discount_codes').update({ used_count: discount.used_count + 1 }).eq('id', discount.id);
    }

    await supabase.from('audit_log').insert({
      user_id: uid,
      action: 'payment_completed',
      entity_type: 'payment',
      entity_id: payment.id,
      details: { amount_cents: total, discount_code: discount?.code ?? null },
    });

    loadPayments();
  }

  const totalCents = calculateTotal();
  const hasPaid = payments.some((p) => p.status === 'paid');

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading…</div></div>;

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-3xl">Payment</h1>
        <p className="mt-1 text-sm text-slate-400">Program enrollment payment.</p>
      </div>

      {hasPaid ? (
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">✓</div>
            <div>
              <div className="text-lg font-serif text-emerald-400">Payment Complete</div>
              <div className="text-sm text-slate-400">You're enrolled in the program.</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card space-y-6">
          <div>
            <div className="text-lg font-serif text-slate-100">Accelerator Academy — Session 1</div>
            <div className="mt-1 text-sm text-slate-400">13-week transformation program</div>
          </div>

          {/* Price */}
          <div className="rounded-md border border-ink-line bg-ink p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Program Fee</span>
              <span className="text-sm text-slate-100">${(PROGRAM_PRICE_CENTS / 100).toFixed(2)}</span>
            </div>
            {discount && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm text-emerald-400">Discount ({discount.code})</span>
                <span className="text-sm text-emerald-400">
                  -{discount.type === 'percent' ? `${discount.value}%` : `$${(discount.value / 100).toFixed(2)}`}
                </span>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-ink-line pt-3">
              <span className="text-sm font-medium text-slate-100">Total</span>
              <span className="text-lg font-serif text-brass">${(totalCents / 100).toFixed(2)}</span>
            </div>
          </div>

          {/* Discount Code */}
          <div>
            <label className="label">Discount Code</label>
            <div className="flex gap-2">
              <input className="input flex-1" value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} placeholder="Enter code" />
              <button className="btn text-xs" onClick={applyDiscount}>Apply</button>
            </div>
            {discountError && <div className="mt-1 text-xs text-red-400">{discountError}</div>}
            {discount && <div className="mt-1 text-xs text-emerald-400">✓ {discount.description ?? 'Discount applied'}</div>}
          </div>

          <button className="btn-primary w-full" onClick={handlePayment}>
            Pay ${(totalCents / 100).toFixed(2)}
          </button>
          <p className="text-center text-xs text-slate-500">Secure payment via Stripe. Payment can be pending during onboarding.</p>
        </div>
      )}

      {/* Payment History */}
      {payments.length > 0 && (
        <div className="card">
          <div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">Payment History</div>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-ink-line py-2 last:border-0">
                <div>
                  <div className="text-sm text-slate-200">${(p.amount_cents / 100).toFixed(2)}</div>
                  <div className="text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()}{p.discount_code && ` · ${p.discount_code}`}</div>
                </div>
                <PaymentStatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-emerald-500/10 text-emerald-400',
    pending: 'bg-yellow-500/10 text-yellow-400',
    failed: 'bg-red-500/10 text-red-400',
    refunded: 'bg-slate-500/10 text-slate-400',
    waived: 'bg-blue-500/10 text-blue-400',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}>{status}</span>;
}
