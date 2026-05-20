import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CustomerProvider } from './context/CustomerContext';
import { StockProvider } from './context/StockContext';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <CustomerProvider>
      <StockProvider>
        <App />
      </StockProvider>
    </CustomerProvider>
  </React.StrictMode>
);

serviceWorkerRegistration.register();
