/* global loggedUser */

import 'nwl-components/dist/style.css';
import MRIPage from '../components/MRIPage.vue';
import config from '../nwl-components-config';
import { createApp } from 'vue';

const app = createApp(MRIPage);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
