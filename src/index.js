import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { CustomerProvider } from './context/CustomerContext';
import { StockProvider } from './context/StockContext';
import { UIProvider } from './context/UIContext';
import { SalesProvider } from './context/SalesContext';
import { PartsProvider } from './context/PartsContext';
import { TradersProvider } from './context/TradersContext';
import { ReservationsProvider } from './context/ReservationsContext';
import { ChatProvider } from './context/ChatContext';
import { ImportProvider } from './context/ImportContext';
import { AskClaudeProvider } from './context/AskClaudeContext';
import { BroadcastProvider } from './context/BroadcastContext';
import { ProfileProvider } from './context/ProfileContext';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <ProfileProvider>
      <UIProvider>
        <BroadcastProvider>
        <SalesProvider>
          <PartsProvider>
            <CustomerProvider>
              <TradersProvider anthropicKey={localStorage.getItem("jnp_anthropic_key") || ""}>
                <ReservationsProvider>
                  <StockProvider>
                    <ChatProvider>
                      <ImportProvider>
                        <AskClaudeProvider>
                          <App />
                        </AskClaudeProvider>
                      </ImportProvider>
                    </ChatProvider>
                  </StockProvider>
                </ReservationsProvider>
              </TradersProvider>
            </CustomerProvider>
          </PartsProvider>
        </SalesProvider>
        </BroadcastProvider>
      </UIProvider>
      </ProfileProvider>
    </AuthProvider>
  </React.StrictMode>
);

serviceWorkerRegistration.unregister();
