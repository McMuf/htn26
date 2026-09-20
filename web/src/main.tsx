import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import { Site } from './site/Site';
import './theme.css';

// /paint = the mobile painting client (needs a phone); everything else = the read-only companion site
const path = window.location.pathname;
const isPaint = path.startsWith('/paint');
document.title = isPaint ? 'Cospray — paint' : 'Cospray';
// the paint client's stylesheet is global (big hold buttons, tabs); keep it off the companion pages
if (isPaint) import('./styles.css');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPaint ? <App /> : <Site path={path} />}
    <Analytics />
  </StrictMode>,
);
