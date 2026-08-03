import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from './ErrorState';
import { renderScreen } from '../test/render';

it('reassures that nothing is lost', () => {
  renderScreen(<ErrorState />, { initial: { screen: 'error' } });
  expect(screen.getByRole('heading')).toHaveTextContent('Connexion perdue');
  expect(
    screen.getByText(/enregistrées localement/),
  ).toBeInTheDocument();
  expect(screen.getByText(/ERR_NETWORK/)).toBeInTheDocument();
});

it('retries back to home', async () => {
  const user = userEvent.setup();
  renderScreen(<ErrorState />, { initial: { screen: 'error' } });
  await user.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(screen.getByTestId('screen')).toHaveTextContent('home');
  expect(screen.getByTestId('toast')).toHaveTextContent('Reconnecté');
});
