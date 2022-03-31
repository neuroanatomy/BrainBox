/* global project, loggedUser */

import 'nwl-components/dist/style.css';
import { createApp, ref } from 'vue';
import { SettingsPage } from 'nwl-components';
import config from '../nwl-components-config';

let cursorFiles = 0;
const queryFiles = async (files) => {
  const res = await fetch(`/project/json/${project.shortname}/files?start=${cursorFiles}&length=100&name=true`);
  const list = await res.json();
  if(list.length) {
    files.push(...list);
    cursorFiles += 100;

    if(list.length === 100) {
      return queryFiles(files);
    }
  }

  return files;
};

const PageContents = {
  template: `
    <SettingsPage :project="project" :files="files" />
  `,
  setup() {
    const files = ref([]);

    return {
      project,
      files
    };
  },
  mounted() {
    const fetchFiles = async () => {
      const files = await queryFiles([]);
      this.files.push(...files);
    };
    fetchFiles();
  }
};
const app = createApp(PageContents);
app.component('SettingsPage', SettingsPage);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
