import { createRoot } from 'react-dom/client';
// 必须先于 ./App(及其 store 依赖链)执行:一次性迁移旧版本 localStorage 键名
import './stores/migrate';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './assets/fonts/fonts.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(<App />);
