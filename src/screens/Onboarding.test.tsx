import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from './Onboarding';
import { ONBOARDING } from '../data/onboarding';
import { renderScreen } from '../test/render';

const setup = (onb = 0) =>
  renderScreen(<Onboarding />, { initial: { screen: 'onboarding', onb } });

it('opens on the first slide', () => {
  setup();
  expect(screen.getByRole('heading')).toHaveTextContent(ONBOARDING[0].title);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
});

it('advances through the slides', async () => {
  const user = userEvent.setup();
  setup();
  await user.click(screen.getByRole('button', { name: 'Continuer' }));
  expect(screen.getByRole('heading')).toHaveTextContent(ONBOARDING[1].title);
  await user.click(screen.getByRole('button', { name: 'Continuer' }));
  expect(screen.getByRole('heading')).toHaveTextContent(ONBOARDING[2].title);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
});

it('closes the last slide with its own call to action', () => {
  setup(2);
  expect(
    screen.getByRole('button', { name: 'Créer mon profil' }),
  ).toBeInTheDocument();
});

it('promises the surprise on the final slide', () => {
  setup(2);
  expect(screen.getByText(/Vous ne verrez jamais qui/)).toBeInTheDocument();
});

it('skips straight to home', async () => {
  const user = userEvent.setup();
  setup();
  await user.click(screen.getByRole('button', { name: 'Passer' }));
  expect(screen.getByTestId('screen')).toHaveTextContent('home');
});

it('lands on home after the final call to action', async () => {
  const user = userEvent.setup();
  setup(2);
  await user.click(screen.getByRole('button', { name: 'Créer mon profil' }));
  expect(screen.getByTestId('screen')).toHaveTextContent('home');
});
