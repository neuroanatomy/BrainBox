/* global loggedUser projectInfo projectName */

import 'nwl-components/dist/style.css';
import { createApp } from 'vue';

import ProjectPage from '../components/ProjectPage.vue';
import config from '../nwl-components-config';

const app = createApp(ProjectPage, {project: projectInfo, projectName});
app.provide('config', config);
app.provide('user', loggedUser);
app.provide('displaySettings', true);

app.mount('#app');
