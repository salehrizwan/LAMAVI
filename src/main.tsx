import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installServerlessFallbackInterceptor } from './utils/firebaseClientFallback';

installServerlessFallbackInterceptor();

createRoot(document.getElementById('root')!).render(<App />);
