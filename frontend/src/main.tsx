/**
 * FlowMeter Application Entry Point
 *
 * Initializes the React application and mounts it to the DOM.
 *
 * This file:
 * 1. Creates a React root using the new React 18 createRoot API
 * 2. Wraps the App component in React.StrictMode for development checks
 * 3. Imports global styles from styles/index.css (Tailwind directives)
 *
 * The application is mounted to the #root element defined in index.html.
 * React.StrictMode enables additional development-only checks and warnings:
 * - Detecting unsafe lifecycles
 * - Warning about deprecated APIs
 * - Detecting unexpected side effects
 * - Detecting legacy context API
 *
 * @see {@link https://react.dev/reference/react/StrictMode} React StrictMode docs
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
      <App />
  </React.StrictMode>
);
