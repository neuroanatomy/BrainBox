/* global loggedUser */
import 'nwl-components/dist/style.css';
import '../style/ask-for-login.css';
import { Footer, Header, Wrapper } from 'nwl-components';
import config from '../nwl-components-config';
import { createApp } from 'vue';

// nwl-components' header (its Nav has the Log In link) and footer around the server's message
const app = createApp({ template: '#template' });
app.component('Wrapper', Wrapper);
app.component('Header', Header);
app.component('Footer', Footer);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
