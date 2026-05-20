import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CustomerProvider } from './context/CustomerContext';
import { StockProvider } from './context/StockContext';
import { UIProvider } from './context/UIContext';
import { SalesProvider } from './context/SalesContext';
import { PartsProvider } from './context/PartsContext';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <UIProvider>
      <SalesProvider>
        <PartsProvider>
          <CustomerProvider>
            <StockProvider>
              <App />
            </StockProvider>
          </CustomerProvider>
        </PartsProvider>
      </SalesProvider>
    </UIProvider>
  </React.StrictMode>
);

serviceWorkerRegistration.register();
