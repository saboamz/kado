import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from './ErrorState';
import { renderScreen } from '../test/render';

it('reassures that nothing is lost', () => {
  renderScreen(<ErrorState />);
  expect(screen.getByRole('heading')).toHaveTextContent('Connexion perdue');
  expect(screen.getByText(/enregistrées localement/)).toBeInTheDocument();
  expect(screen.getByText(/ERR_NETWORK/)).toBeInTheDocument();
});

it('retries back to home', async () => {
  const user = userEvent.setup();
  // Start somewhere other than home, so landing on '/' proves navigation
  // happened rather than that we never left.
  renderScreen(<ErrorState />, { route: '/parametres' });
  await user.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(screen.getByTestId('path')).toHaveTextContent('/');
  expect(screen.getByTestId('toast')).toHaveTextContent('Reconnecté');
});
