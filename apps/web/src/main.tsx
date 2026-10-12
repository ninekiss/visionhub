import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import '@visionhub/ui/tokens.css';
import './styles.css';

const isAdminRoute = window.location.pathname.startsWith('/admin');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isAdminRoute ? <AdminApp /> : <App />}</React.StrictMode>,
);
