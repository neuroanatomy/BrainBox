import 'nwl-components/dist/style.css';
import Embed from '../components/Embed.vue';
import config from '../nwl-components-config';
import { createApp } from 'vue';

const app = createApp(Embed);
app.provide('config', config);

app.mount('#app');
