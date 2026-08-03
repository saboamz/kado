import type { ComponentType } from 'react';
import { useStore } from '../state/store';
import type { ScreenId } from '../data/types';
import { Home } from '../screens/Home';
import { Notifications } from '../screens/Notifications';
import { Onboarding } from '../screens/Onboarding';
import { Placeholder } from '../screens/Placeholder';
import { Profile } from '../screens/Profile';
import { Search } from '../screens/Search';
import { Wishlist } from '../screens/Wishlist';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { Toast } from './Toast';

/** Screens that keep the tab bar visible. */
const WITH_NAV: ScreenId[] = ['home', 'search', 'notifs', 'profile', 'list'];

const SCREENS: Partial<Record<ScreenId, ComponentType>> = {
  onboarding: Onboarding,
  home: Home,
  search: Search,
  notifs: Notifications,
  profile: Profile,
  list: Wishlist,
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
        {Current ? <Current /> : <Placeholder name={state.screen} />}
      </div>
      {toast && <Toast message={toast} />}
      {WITH_NAV.includes(state.screen) && <TabBar />}
    </>
  );
}
