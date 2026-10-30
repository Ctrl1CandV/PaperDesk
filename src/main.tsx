import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/theme.css';
import './styles/reader.css';
import './styles/platform.css';
import { App } from './app/App';
import { applyInitialTheme } from './app/theme';

applyInitialTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
