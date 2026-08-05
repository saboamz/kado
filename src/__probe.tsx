import { Button, Card, Chip, Eyebrow, Progress, ScreenShell } from './ui';
export function Probe() {
  return (
    <ScreenShell>
      <Eyebrow>Test</Eyebrow>
      <Button variant="primary">A</Button>
      <Button variant="secondary" size="lg">B</Button>
      <Chip selected>C</Chip>
      <Card tone="glass" interactive>D</Card>
      <Progress value={1} max={2} label="p" />
    </ScreenShell>
  );
}
