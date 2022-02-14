/* global loggedUser */

import 'nwl-components/dist/style.css';
import { createApp, ref } from 'vue';
import Config from './../../../../cfg.json';
import { NewProjectPage } from 'nwl-components';
import config from '../nwl-components-config';

let host;
if(Config.secure) {
  host = 'wss://' + Config.wshostname;
} else {
  host = 'ws://' + Config.wshostname;
}

const NewPage = {
  template: `
      <NewProjectPage
        :onKeyDown="checkInput"
        :existing-project="existingProject"
        :validInput="validInput"
      >
        A project contains a list of MRI files, a set of volume or
        text annotations, and a list of collaborators with their access rights.
        The short name of a project can only contain letters and numbers, but
        you can choose a longer display name later.
      </NewProjectPage>
    `,
  setup() {
    const existingProject = ref(false);
    const validInput = ref(true);

    let ws;
    if (window.WebSocket) {
      ws = new window.WebSocket(host);
    } else if (window.MozWebSocket) {
      ws = new window.MozWebSocket(host);
    }
    ws.onopen = function () {
      ws.send(JSON.stringify({ 'type': 'autocompleteClient' }));
    };
    ws.onmessage = function (message) {
      message = JSON.parse(message.data);
      if (message.type === 'projectNameQuery') {
        if (message.metadata) {
          existingProject.value = true;
        } else {
          existingProject.value = false;
        }
      }
    };

    return {
      ws,
      existingProject,
      validInput,
      checkInput(event) {
        existingProject.value = false;
        validInput.value = (/^[a-zA-Z0-9]*$/).test(event.target.value);
        ws.send(JSON.stringify({ 'type': 'projectNameQuery', 'metadata': { 'name': event.target.value } }));
      }
    };
  }
};

const app = createApp(NewPage);
app.component('NewProjectPage', NewProjectPage);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
