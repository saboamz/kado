import { FONT } from '../theme';

/**
 * Transient confirmation. Announced politely so the reservation feedback
 * reaches screen readers, which the prototype's visual-only toast did not.
 */
export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        bottom: 106,
        left: '50%',
        zIndex: 60,
        padding: '13px 18px',
        borderRadius: 15,
        background: '#111114',
        color: '#fff',
        font: `500 13px/1.35 ${FONT.sans}`,
        boxShadow: '0 16px 34px -12px rgba(0,0,0,.5)',
        animation: 'kToast 2.6s both',
        maxWidth: 300,
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}
