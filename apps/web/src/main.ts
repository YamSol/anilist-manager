import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Elemento #app não encontrado em index.html');
}

export default mount(App, { target });
