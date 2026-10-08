import {createRoot} from 'react-dom/client';
import {Toaster} from 'react-hot-toast';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#1A1D27',
          border: '1px solid #2A2D3E',
          color: '#E5E7EB',
          borderRadius: '12px',
          fontSize: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        },
        success: {
          iconTheme: {primary: '#00D084', secondary: '#1A1D27'},
          style: {borderColor: 'rgba(0,208,132,0.4)'},
        },
        error: {
          iconTheme: {primary: '#EF4444', secondary: '#1A1D27'},
          style: {borderColor: 'rgba(239,68,68,0.4)'},
        },
      }}
    />
  </>
);
