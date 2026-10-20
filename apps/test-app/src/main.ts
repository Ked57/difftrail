import { createApp } from 'vue';
import App from './App.vue';
import { createBrowserRouter } from './router.js';
import './styles/tailwind.css';
import './styles/base.css';

createApp(App).use(createBrowserRouter()).mount('#app');
