import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installLocalFallbackInterceptor } from './utils/localClientFallback';

installLocalFallbackInterceptor();

createRoot(document.getElementById('root')!).render(<App />);
