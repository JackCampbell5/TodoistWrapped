import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App.tsx';
import { ShareSafeProvider } from './lib/shareSafe.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ShareSafeProvider>
        <App />
      </ShareSafeProvider>
    </MotionConfig>
  </StrictMode>,
);
