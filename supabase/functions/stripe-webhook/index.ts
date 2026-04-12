import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.metadata?.payment_id;
    const userId = session.metadata?.user_id;
    const discountCode = session.metadata?.discount_code;

    if (paymentId) {
      // Mark payment as paid
      await supabase.from('payments').update({
        status: 'paid',
        stripe_payment_id: session.payment_intent as string,
        paid_at: new Date().toISOString(),
      }).eq('id', paymentId);

      // Increment discount code usage
      if (discountCode) {
        await supabase.rpc('increment_discount_usage', { code_value: discountCode });
      }

      // Audit log
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: 'payment_completed',
        entity_type: 'payment',
        entity_id: paymentId,
        details: { stripe_session_id: session.id, amount: session.amount_total },
      });

      // Send notification
      if (userId) {
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'payment',
          title: 'Payment Confirmed',
          body: 'Your enrollment payment has been received. Welcome to Statesmen Accelerator.',
          channels: ['in_app'],
        });
      }
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.metadata?.payment_id;
    if (paymentId) {
      await supabase.from('payments').update({ status: 'failed', failed_at: new Date().toISOString() }).eq('id', paymentId);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
