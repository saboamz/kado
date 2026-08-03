import { FONT } from '../theme';

/** iOS status bar: fixed 9:41, Dynamic Island, signal and battery. */
export function StatusBar() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 54,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 30px 0 34px',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          font: `600 14.5px/1 ${FONT.sans}`,
          color: 'var(--fg)',
          letterSpacing: '-.01em',
        }}
      >
        9:41
      </span>
      <div
        style={{
          width: 105,
          height: 30,
          borderRadius: 16,
          background: '#0a0a0a',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          top: 11,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 1.5,
            height: 10,
          }}
        >
          {[4, 6, 8, 10].map((h) => (
            <div
              key={h}
              style={{
                width: 3,
                height: h,
                borderRadius: 1,
                background: 'var(--fg)',
              }}
            />
          ))}
        </div>
        <div
          style={{
            width: 22,
            height: 11,
            borderRadius: 3.5,
            border: '1.2px solid var(--fg)',
            opacity: 0.9,
            padding: 1.5,
          }}
        >
          <div
            style={{
              width: '70%',
              height: '100%',
              borderRadius: 2,
              background: 'var(--fg)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
