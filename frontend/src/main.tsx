import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import './styles/branding.css';
import './styles/dossier.css';
import './styles/dossier-polish.css';
import './styles/interface.css';
import { initializeTheme } from './components/ThemeToggle';
import { Brand } from './components/Brand';
import { RosObservatory } from './observatory/RosObservatory';

const liveRos = new URLSearchParams(window.location.search).get('mode') === 'ros';
const BrowserApp = lazy(() => import('./app/App').then(module => ({ default: module.App })));
initializeTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="brand-loading" role="status"><Brand /><p>Preparing mission control…</p></div>}>
      {liveRos ? <RosObservatory /> : <BrowserApp />}
    </Suspense>
  </StrictMode>,
);
