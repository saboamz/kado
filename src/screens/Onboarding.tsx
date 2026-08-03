import { PlaceholderArt } from '../components/Placeholder';
import { ONBOARDING } from '../data/onboarding';
import { useStore } from '../state/store';
import { FONT, primaryButton, useTheme } from '../theme';

export function Onboarding() {
  const { state, dispatch } = useStore();
  const theme = useTheme();
  const { t } = theme;
  const slide = ONBOARDING[state.onb];

  return (
    <div
      style={{
        minHeight: 852,
        display: 'flex',
        flexDirection: 'column',
        padding: '78px 26px 40px',
        animation: 'kFadeUp .45s both',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PlaceholderArt
          label={slide.art}
          fill={t.surface}
          hatch={5}
          style={{
            width: '100%',
            aspectRatio: '1 / 1.1',
            borderRadius: 28,
            padding: 20,
          }}
        />
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={ONBOARDING.length}
        aria-valuenow={state.onb + 1}
        aria-label={`Étape ${state.onb + 1} sur ${ONBOARDING.length}`}
        style={{ display: 'flex', gap: 6, margin: '34px 0 20px' }}
      >
        {ONBOARDING.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === state.onb ? 22 : 7,
              height: 7,
              borderRadius: 4,
              background: i === state.onb ? theme.accent : t.chip,
              transition: 'all .3s',
            }}
          />
        ))}
      </div>

      <h2
        style={{
          font: `700 30px/1.14 ${FONT.sans}`,
          letterSpacing: '-.03em',
          color: t.fg,
          margin: '0 0 12px',
          textWrap: 'pretty',
        }}
      >
        {slide.title}
      </h2>
      <p
        style={{
          font: `400 15px/1.55 ${FONT.sans}`,
          color: t.fg2,
          margin: '0 0 26px',
          textWrap: 'pretty',
          minHeight: 70,
        }}
      >
        {slide.body}
      </p>

      <button
        onClick={() => dispatch({ type: 'onbNext' })}
        style={primaryButton(theme)}
      >
        {slide.cta}
      </button>
      <button
        onClick={() => dispatch({ type: 'go', screen: 'home' })}
        style={{
          width: '100%',
          height: 46,
          font: `500 14px/1 ${FONT.sans}`,
          color: t.fg2,
        }}
      >
        Passer
      </button>
    </div>
  );
}
