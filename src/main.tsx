import {createRoot} from 'react-dom/client';
import { Suspense } from 'react';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<Suspense fallback={<div className='zain-page-loader'>Menyiapkan layanan ZAIN.NET...</div>}><App /></Suspense>);
