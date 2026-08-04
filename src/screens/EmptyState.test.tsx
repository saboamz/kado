import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './EmptyState';
import { renderScreen } from '../test/render';

it('explains what an empty list means', () => {
  renderScreen(<EmptyState />);
  expect(screen.getByRole('heading')).toHaveTextContent('Aucune envie ici');
  expect(screen.getByText(/Collez un lien/)).toBeInTheDocument();
});

it('sends the user to the add flow', async () => {
  const user = userEvent.setup();
  renderScreen(<EmptyState />);
  await user.click(screen.getByRole('button', { name: 'Ajouter une envie' }));
  expect(screen.getByTestId('path')).toHaveTextContent('/ajouter/lien');
});
