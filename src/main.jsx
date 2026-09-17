import React from 'react';
import {createRoot} from 'react-dom/client';
import App,{StartupErrorBoundary} from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StartupErrorBoundary><App/></StartupErrorBoundary>
);
