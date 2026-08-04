import { screen } from '@testing-library/react';
import { Notifications } from './Notifications';
import { NOTIFICATIONS } from '../data/social';
import { renderScreen } from '../test/render';

const onNotifications = { route: '/notifications' };

it('lists every notification', () => {
  renderScreen(<Notifications />, onNotifications);
  expect(screen.getAllByRole('listitem')).toHaveLength(NOTIFICATIONS.length);
});

it('marks only the unread ones', () => {
  renderScreen(<Notifications />, onNotifications);
  const unread = NOTIFICATIONS.filter((n) => n.unread).length;
  expect(screen.getAllByLabelText('Non lue')).toHaveLength(unread);
});

it('names the actor in each entry', () => {
  renderScreen(<Notifications />, onNotifications);
  expect(screen.getByText('Emma')).toBeInTheDocument();
  expect(screen.getByText('Cagnotte MacBook')).toBeInTheDocument();
});
