import './utils/offscreenFallback';
import './tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GlobalTips } from './components/shared/HelpTooltip';
import { installPhoneLeaveGuard } from './components/mobile/leaveWindow';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const tipsElement = document.createElement('div');
tipsElement.id = 'k-tips-root';
document.body.appendChild(tipsElement);
const tipsRoot = ReactDOM.createRoot(tipsElement);
if (new URLSearchParams(window.location.search).has('uikit')) {
  import('./components/kit/KitPreview').then(({ default: KitPreview }) => {
    root.render(<React.StrictMode><KitPreview /></React.StrictMode>);
    tipsRoot.render(<React.StrictMode><GlobalTips /></React.StrictMode>);
  });
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  tipsRoot.render(<React.StrictMode><GlobalTips /></React.StrictMode>);
  installPhoneLeaveGuard();
}
