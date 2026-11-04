import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/biz-udpgothic/400.css';
import '@fontsource/biz-udpgothic/700.css';
import '@fontsource/zen-old-mincho/400.css';
import '@fontsource/zen-old-mincho/700.css';
import './ui/app.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
