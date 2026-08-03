import { PhoneFrame } from './components/PhoneFrame';
import { Screen } from './components/Screen';
import { StoreProvider, useStore } from './state/store';
import { ThemeProvider } from './theme';

function Device() {
  const { state } = useStore();
  return (
    <ThemeProvider dark={state.dark}>
      <PhoneFrame>
        <Screen />
      </PhoneFrame>
    </ThemeProvider>
  );
}

export function App() {
  return (
    <StoreProvider>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
        }}
      >
        <Device />
      </div>
    </StoreProvider>
  );
}
