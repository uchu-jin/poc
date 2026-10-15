import './style.css';
import { startApp } from './features/viewer/app';
import { browserClock, documentVisibility, preloadImage } from './features/viewer/browser';

const root = document.getElementById('app');
if (root) {
  startApp(root, {
    fetch: (input, init) => fetch(input, init),
    storage: () => window.localStorage,
    clock: browserClock,
    visibility: documentVisibility,
    preload: preloadImage,
  });
}
