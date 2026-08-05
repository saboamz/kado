import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Button, Card, ScreenShell } from '../ui';

/**
 * Magic-link sign in.
 *
 * No password, deliberately: passwords mean a reset flow, a strength policy
 * and a breach surface, none of which this product needs to establish that
 * someone controls an email address.
 */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });

    if (error) {
      setStatus('error');
      setMessage(error.message);
      return;
    }
    setStatus('sent');
  }

  return (
    <ScreenShell withNav={false} className="pt-16 sm:pt-24">
      <h1 className="text-4xl leading-none font-bold tracking-tighter text-fg">
        Kado
      </h1>
      <p className="mt-3 text-pretty leading-relaxed text-fg2">
        Des listes de souhaits que vos proches remplissent en secret.
      </p>

      {status === 'sent' ? (
        // aria-live so the confirmation is announced: the visual change is the
        // whole feedback, and a screen reader user would otherwise submit the
        // form again wondering whether it worked.
        <Card tone="soft" radius="lg" className="mt-8" role="status" aria-live="polite">
          <p className="text-pretty leading-relaxed text-fg">
            Lien envoyé à <strong>{email}</strong>. Ouvrez-le sur cet appareil
            pour vous connecter.
          </p>
        </Card>
      ) : (
        <form onSubmit={submit} className="mt-8">
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-medium text-fg2"
          >
            Votre adresse e-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
            className="mb-3 h-12.5 w-full rounded-xl border border-line2 bg-bg px-3.5 text-base text-fg placeholder:text-fg3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />

          {/*
            Disabled only while the request is in flight, never merely because
            the field is empty: a disabled button is removed from the tab order,
            so gating on emptiness meant a keyboard user could not reach the
            submit control at all until they had typed. The input is `required`,
            so an empty submit gets the browser's own validation message, which
            is more helpful than a button that silently cannot be focused.
          */}
          <Button block size="lg" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Envoi…' : 'Recevoir un lien de connexion'}
          </Button>

          {status === 'error' && (
            <p role="alert" className="mt-3 text-sm text-accent">
              {message}
            </p>
          )}
        </form>
      )}

      <p className="mt-6 text-pretty text-sm leading-relaxed text-fg3">
        Pas de mot de passe : nous vous envoyons un lien à usage unique.
      </p>
    </ScreenShell>
  );
}
