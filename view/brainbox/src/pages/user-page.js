/* global loggedUser user */

import 'nwl-components/dist/style.css';
import { createApp } from 'vue';

import UserPage from '../components/UserPage.vue';
import config from '../nwl-components-config';

const app = createApp(UserPage, { user });
app.provide('config', config);
app.provide('user', loggedUser);
app.provide('displaySettings', true);

app.mount('#app');
