import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The editor's stylesheet, once for the whole app.
import '@image-ultra/react/styles.css';
import './app.css';
import { PhotoEditor } from './PhotoEditor';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PhotoEditor />
  </StrictMode>,
);
