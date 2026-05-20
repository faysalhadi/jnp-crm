import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CustomerProvider } from './context/CustomerContext';
import { StockProvider } from './context/StockContext';
import { UIProvider } from './context/UIContext';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <UIProvider>
      <CustomerProvider>
        <StockProvider>
          <App />
        </StockProvider>
      </CustomerProvider>
    </UIProvider>
  </React.StrictMode>
);

serviceWorkerRegistration.register();
