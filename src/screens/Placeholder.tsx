import { FONT, useTheme } from '../theme';

/** Stand-in for screens that land in later milestones. */
export function Placeholder({ name }: { name: string }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        minHeight: 852,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        textAlign: 'center',
        font: `500 12px/1.6 ${FONT.mono}`,
        color: t.fg3,
      }}
    >
      {name}
      <br />à venir
    </div>
  );
}
