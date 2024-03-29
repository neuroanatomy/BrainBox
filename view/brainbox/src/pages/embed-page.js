import 'nwl-components/dist/style.css';
import { createApp } from 'vue';

import Embed from '../components/Embed.vue';
import config from '../nwl-components-config';

const app = createApp(Embed);
app.provide('config', config);

app.mount('#app');
