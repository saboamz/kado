import type { ComponentType } from 'react';
import { useStore } from '../state/store';
import type { ScreenId } from '../data/types';
import { AddWish } from '../screens/AddWish';
import { EmptyState } from '../screens/EmptyState';
import { ErrorState } from '../screens/ErrorState';
import { GiftDetail } from '../screens/GiftDetail';
import { Home } from '../screens/Home';
import { Notifications } from '../screens/Notifications';
import { Onboarding } from '../screens/Onboarding';
import { Profile } from '../screens/Profile';
import { Search } from '../screens/Search';
import { Settings } from '../screens/Settings';
import { Wishlist } from '../screens/Wishlist';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { Toast } from './Toast';

/** Screens that keep the tab bar visible. */
const WITH_NAV: ScreenId[] = ['home', 'search', 'notifs', 'profile', 'list'];

/**
 * Every screen id maps to a component. Not Partial: adding a ScreenId without
 * a screen is a type error rather than a blank device at runtime.
 */
const SCREENS: Record<ScreenId, ComponentType> = {
  onboarding: Onboarding,
  home: Home,
  search: Search,
  notifs: Notifications,
  profile: Profile,
  list: Wishlist,
  detail: GiftDetail,
  pot: GiftDetail,
  add: AddWish,
  settings: Settings,
  empty: EmptyState,
  error: ErrorState,
};

export function Screen() {
  const { state, toast } = useStore();
  const Current = SCREENS[state.screen];

  return (
    <>
      <StatusBar />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <Current />
      </div>
      {toast && <Toast message={toast} />}
      {WITH_NAV.includes(state.screen) && <TabBar />}
    </>
  );
}
