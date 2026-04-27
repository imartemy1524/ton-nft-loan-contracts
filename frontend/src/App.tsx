import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { NetworkProvider } from './network';
import Layout from './components/Layout';
import Home from './pages/Home';
import GiveLoan from './pages/GiveLoan';
import GetLoan from './pages/GetLoan';
import Profile from './pages/Profile';
import Loan from './pages/Loan';

function App() {
  return (
    <NetworkProvider>
      <TonConnectUIProvider manifestUrl={import.meta.env.VITE_TONCONNECT_MANIFEST_URL}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/give-loan" element={<GiveLoan />} />
              <Route path="/get-loan" element={<GetLoan />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/loan/:address" element={<Loan />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TonConnectUIProvider>
    </NetworkProvider>
  );
}

export default App;
