'use client';

import { useState } from 'react';
import { SendHorizontal } from 'lucide-react';

/**
 * Community submission form (Phase 12). Everything is re-validated on the
 * server; the hidden "website" field is a bot honeypot. Submissions enter a
 * moderation queue — they never change verified scores or fixtures directly.
 */
export default function SubmissionForm() {
  const [kind, setKind] = useState('missing-match');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [url, setUrl] = useState('');
  const [reporter, setReporter] = useState('');
  const [state, setState] = useState({ phase: 'idle', message: '' });

  const submit = async (event) => {
    event.preventDefault();
    setState({ phase: 'sending', message: '' });
    try {
      const response = await fetch('/api/community/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, detail, url: url || undefined, reporter: reporter || undefined, website: '' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setState({ phase: 'error', message: payload?.error || 'Could not send — please try again.' });
        return;
      }
      setState({ phase: 'sent', message: 'Thanks — your submission is in the moderation queue. Verified listings only change once a moderator checks it against an official source.' });
      setTitle(''); setDetail(''); setUrl('');
    } catch {
      setState({ phase: 'error', message: 'Network problem — please try again.' });
    }
  };

  const inputClass = 'w-full rounded-xl border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-900 outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/25 dark:border-navy-750 dark:bg-navy-950 dark:text-zinc-100';

  return (
    <form onSubmit={submit} className="space-y-4" data-submission-form>
      <fieldset className="flex gap-2">
        <legend className="sr-only">What are you submitting?</legend>
        {[
          { id: 'missing-match', label: 'A missing match' },
          { id: 'source-suggestion', label: 'A source for a match' },
        ].map((option) => (
          <label key={option.id} className={`tactile cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold ${kind === option.id ? 'border-lime-500 bg-lime-500/15 text-lime-600 dark:text-lime-400' : 'border-navy-200 text-navy-500 dark:border-navy-750 dark:text-zinc-400'}`}>
            <input type="radio" name="kind" value={option.id} checked={kind === option.id} onChange={() => setKind(option.id)} className="sr-only" />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor="sub-title" className="mb-1 block text-xs font-bold">Title</label>
        <input id="sub-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="e.g. Raja vs Wydad — Casablanca derby" className={inputClass} />
      </div>
      <div>
        <label htmlFor="sub-detail" className="mb-1 block text-xs font-bold">Details</label>
        <textarea id="sub-detail" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={600} required rows={4} placeholder="Competition, kickoff time, and where you saw it listed…" className={inputClass} />
      </div>
      {kind === 'source-suggestion' ? (
        <div>
          <label htmlFor="sub-url" className="mb-1 block text-xs font-bold">Source link (public page)</label>
          <input id="sub-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} required placeholder="https://…" className={inputClass} />
        </div>
      ) : null}
      <div>
        <label htmlFor="sub-reporter" className="mb-1 block text-xs font-bold">Your name (optional)</label>
        <input id="sub-reporter" value={reporter} onChange={(e) => setReporter(e.target.value)} maxLength={60} className={inputClass} />
      </div>

      {state.message ? (
        <p role="status" className={`rounded-xl px-3 py-2 text-xs font-semibold ${state.phase === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-lime-500/10 text-lime-700 dark:text-lime-400'}`}>{state.message}</p>
      ) : null}

      <button type="submit" disabled={state.phase === 'sending'} className="tactile inline-flex items-center gap-2 rounded-xl bg-lime-500 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-lime-400 disabled:opacity-50">
        <SendHorizontal className="h-4 w-4" aria-hidden="true" />
        {state.phase === 'sending' ? 'Sending…' : 'Send to moderators'}
      </button>
    </form>
  );
}
