import { useStore } from '../state/store';
import { Placeholder } from '../screens/Placeholder';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { Toast } from './Toast';

/** Screens that keep the tab bar visible. */
const WITH_NAV = ['home', 'search', 'notifs', 'profile', 'list'];

export function Screen() {
  const { state, toast } = useStore();

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
        <Placeholder name={state.screen} />
      </div>
      {toast && <Toast message={toast} />}
      {WITH_NAV.includes(state.screen) && <TabBar />}
    </>
  );
}
