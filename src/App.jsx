import { AppProvider, useApp } from './state/AppContext.jsx';
import { DialogProvider } from './state/Dialogs.jsx';
import Gate from './components/Gate.jsx';
import Shell from './components/Shell.jsx';
import { BusyOverlay, Toast } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Trending from './pages/Trending.jsx';
import Genre from './pages/Genre.jsx';
import Stories from './pages/Stories.jsx';
import Story from './pages/Story.jsx';
import Prompts from './pages/Prompts.jsx';
import Settings from './pages/Settings.jsx';

const PAGES = { home: Home, trending: Trending, genre: Genre, stories: Stories, story: Story, prompts: Prompts, settings: Settings };

function Router() {
  const { route } = useApp();
  const Page = PAGES[route] || Home;
  return (
    <>
      <Shell><Page /></Shell>
      <BusyOverlay />
      <Toast />
    </>
  );
}

export default function App() {
  return (
    <DialogProvider>
      <Gate>
        {session => (
          <AppProvider key={session.profile.id} session={session}>
            <Router />
          </AppProvider>
        )}
      </Gate>
    </DialogProvider>
  );
}
