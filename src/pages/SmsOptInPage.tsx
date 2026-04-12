// Public page documenting SMS opt-in consent collection.
// Used for Twilio / A2P 10DLC campaign registration review.
// URL: https://accelerator.statesmen.org/sms-opt-in

export default function SmsOptInPage() {
  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10 border-b border-ink-line pb-6">
          <div className="font-serif text-3xl text-brass">Statesmen Accelerator</div>
          <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">
            SMS Program Opt-In Consent
          </div>
        </header>

        <section className="mb-10 space-y-3">
          <h1 className="text-2xl font-serif text-slate-100">About this page</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            This page documents how Statesmen Accelerator collects opt-in consent from users before
            sending them SMS messages. It exists to satisfy U.S. A2P 10DLC campaign registration
            requirements.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            <strong className="text-slate-100">Business name:</strong> Statesmen Accelerator<br />
            <strong className="text-slate-100">Website:</strong>{' '}
            <a href="https://accelerator.statesmen.org" className="text-brass underline">
              https://accelerator.statesmen.org
            </a>
            <br />
            <strong className="text-slate-100">Program:</strong> A 13-week personal development and
            leadership accelerator for young men, delivered through a web application.
          </p>
        </section>

        <section className="mb-10 space-y-3">
          <h2 className="text-xl font-serif text-slate-100">How consent is collected</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            SMS opt-in is collected inside the Statesmen Accelerator web application during the
            Profile Setup step of new-user onboarding, immediately after account creation. The
            field is optional — a user may leave their phone number blank and skip SMS entirely.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            If the user chooses to provide a phone number, they must additionally tick a dedicated
            consent checkbox before the form can be submitted. Opting in is an affirmative,
            separate action from providing the phone number itself. No user is sent SMS unless the
            checkbox has been explicitly checked and the consent timestamp has been recorded in our
            database (<code className="text-brass">profiles.sms_opt_in_at</code>).
          </p>
        </section>

        <section className="mb-10 space-y-3">
          <h2 className="text-xl font-serif text-slate-100">Exact opt-in UI shown to users</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            The following is a faithful reproduction of the consent UI presented to users during
            sign-up. The text shown is verbatim what the user agrees to when they tick the box.
          </p>

          {/* Visual reproduction of the real consent UI */}
          <div className="mt-4 rounded-lg border border-ink-line bg-ink-soft p-6">
            <div className="mb-4 text-xs uppercase tracking-wider text-slate-500">
              Profile Setup — Statesmen Accelerator onboarding
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Phone (for SMS reminders)
                </label>
                <input
                  type="text"
                  readOnly
                  value="+1 555 555 5555"
                  className="w-full rounded-md border border-ink-line bg-ink px-3 py-2 text-sm text-slate-400"
                />
              </div>
              <label className="flex cursor-default items-start gap-2 rounded-md border border-ink-line bg-ink p-3">
                <input
                  type="checkbox"
                  checked={false}
                  readOnly
                  className="mt-0.5 accent-brass"
                />
                <span className="text-xs text-slate-300">
                  I agree to receive recurring SMS messages from Statesmen Accelerator at the
                  number above, including session reminders, interview confirmations, assessment
                  deadlines, and program updates. Message frequency varies. Message and data rates
                  may apply. Reply STOP to opt out, HELP for help. See our SMS terms.
                </span>
              </label>
            </div>
          </div>
        </section>

        <section className="mb-10 space-y-3">
          <h2 className="text-xl font-serif text-slate-100">Types of messages users will receive</h2>
          <ul className="ml-5 list-disc space-y-2 text-sm text-slate-300">
            <li>
              <strong className="text-slate-100">Session reminders</strong> — 24-hour and 15-minute
              reminders before each live session.
            </li>
            <li>
              <strong className="text-slate-100">Interview confirmations</strong> — confirmation
              when a user books a fit-interview slot, plus a reminder 24 hours and 15 minutes
              before the scheduled call.
            </li>
            <li>
              <strong className="text-slate-100">Application decisions</strong> — notifications
              when the user's application status changes (approved, waitlisted, on hold).
            </li>
            <li>
              <strong className="text-slate-100">Assessment deadlines</strong> — reminders when a
              scheduled assessment (weekly pulse, character profile, etc.) is due.
            </li>
            <li>
              <strong className="text-slate-100">Escalations and account actions</strong> —
              time-sensitive program alerts (e.g., missed session follow-ups, Captain check-in
              requests).
            </li>
            <li>
              <strong className="text-slate-100">Program updates</strong> — occasional
              announcements about cohort schedule changes or platform updates.
            </li>
          </ul>
          <p className="text-sm text-slate-300 leading-relaxed">
            Statesmen Accelerator does not send promotional, marketing, or third-party SMS.
            Messages are transactional and directly related to the user's participation in the
            program.
          </p>
        </section>

        <section className="mb-10 space-y-3">
          <h2 className="text-xl font-serif text-slate-100">Frequency</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Message frequency varies based on the user's current stage in the program and their
            activity. A typical active Gentleman in a cohort receives roughly <strong className="text-slate-100">5–15 messages per week</strong>. Users in review or waitlist phases receive
            significantly fewer (1–3 per week). Users receive no SMS when their application is
            declined or their cohort has ended.
          </p>
        </section>

        <section className="mb-10 space-y-3">
          <h2 className="text-xl font-serif text-slate-100">How users opt out</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Users can opt out of SMS at any time by:
          </p>
          <ul className="ml-5 list-disc space-y-2 text-sm text-slate-300">
            <li>
              Replying <code className="text-brass">STOP</code> to any message. This is processed
              automatically by Twilio and ends all further SMS to that number immediately.
            </li>
            <li>
              Removing the phone number from their profile in the web application (Profile →
              Edit).
            </li>
            <li>
              Emailing <a href="mailto:support@statesmen.org" className="text-brass underline">support@statesmen.org</a>{' '}
              to request removal.
            </li>
          </ul>
          <p className="text-sm text-slate-300 leading-relaxed">
            Users who reply <code className="text-brass">HELP</code> receive a single automated
            message with support contact information. No other SMS is sent in response to HELP.
          </p>
        </section>

        <section className="mb-10 space-y-3">
          <h2 className="text-xl font-serif text-slate-100">Message and data rates</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Standard message and data rates from the user's mobile carrier may apply. Statesmen
            Accelerator does not charge users for SMS.
          </p>
        </section>

        <section className="mb-10 space-y-3">
          <h2 className="text-xl font-serif text-slate-100">Privacy and data handling</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Phone numbers collected under SMS opt-in are used exclusively for the transactional
            messages listed above. They are not shared with, sold to, or rented by any third
            parties. Numbers are stored in an encrypted Postgres database (Supabase) with row-level
            security limiting access to the user themselves, their assigned Captain, and the
            Headmaster.
          </p>
        </section>

        <section className="mb-10 space-y-3">
          <h2 className="text-xl font-serif text-slate-100">Contact</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            For questions about SMS opt-in or to report a problem, email{' '}
            <a href="mailto:support@statesmen.org" className="text-brass underline">
              support@statesmen.org
            </a>
            .
          </p>
        </section>

        <footer className="mt-12 border-t border-ink-line pt-6 text-center text-xs text-slate-500">
          Last updated: April 2026 · Statesmen Accelerator · All rights reserved
        </footer>
      </div>
    </div>
  );
}
