import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlaceholderArt } from '../components/Placeholder';
import { ONBOARDING } from '../data/onboarding';
import { Button, cn } from '../ui';

export function Onboarding() {
  const navigate = useNavigate();

  /**
   * The slide index is local, not store state.
   *
   * It was `state.onb` in the reducer, but nothing outside this screen ever
   * read it, and it is meaningless the moment you leave. It is also
   * deliberately NOT a URL segment: onboarding steps are not places you should
   * be able to deep-link into or Back through halfway.
   */
  const [step, setStep] = useState(0);
  const slide = ONBOARDING[step];
  const isLast = step === ONBOARDING.length - 1;

  const finish = () => navigate('/');

  return (
    // Not a ScreenShell: this screen owns the full viewport height and has no
    // tab bar, so it centres its art in the leftover space instead of scrolling
    // in a shell sized for one.
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col',
        'px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:pt-16',
        'animate-[kFadeUp_.45s_both] motion-reduce:animate-none',
      )}
    >
      <div className="flex flex-1 items-center justify-center">
        <PlaceholderArt
          label={slide.art}
          hatch={5}
          className="w-full max-w-sm rounded-3xl bg-surface p-5 [aspect-ratio:1/1.1]"
        />
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={ONBOARDING.length}
        aria-valuenow={step + 1}
        aria-label={`Étape ${step + 1} sur ${ONBOARDING.length}`}
        className="mt-8 mb-5 flex gap-1.5"
      >
        {ONBOARDING.map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              'h-1.75 rounded-sm transition-all duration-300 motion-reduce:transition-none',
              i === step ? 'w-5.5 bg-accent' : 'w-1.75 bg-chip',
            )}
          />
        ))}
      </div>

      <h2 className="mb-3 text-4xl leading-tight font-bold tracking-tighter text-pretty text-fg">
        {slide.title}
      </h2>
      {/* The min-height stops the button pair from jumping between slides whose
          copy runs to a different number of lines. */}
      <p className="mb-6 min-h-17.5 text-lg leading-relaxed text-pretty text-fg2">
        {slide.body}
      </p>

      <Button
        size="lg"
        block
        onClick={() => (isLast ? finish() : setStep(step + 1))}
      >
        {slide.cta}
      </Button>
      <Button variant="ghost" block onClick={finish} className="mt-1">
        Passer
      </Button>
    </div>
  );
}
