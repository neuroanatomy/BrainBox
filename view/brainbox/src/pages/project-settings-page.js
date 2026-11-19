/* global project, filesTotal, loggedUser */

import 'nwl-components/dist/style.css';
import { SettingsPage, useBatchedFiles } from 'nwl-components';
import config from '../nwl-components-config';
import { createApp } from 'vue';
import labelsetWarningModule from '../../../shared/labelsetWarning.js';

const { changedVolumeLabelsets, labelsetWarning } = labelsetWarningModule;

// The files are fetched in batches after the page is shown (nwl-components' useBatchedFiles).
// `filesLoaded`, the number of files received, is sent to the server when saving: if it is
// not the number of files stored, the server keeps the stored list instead of the partial
// one. SettingsPage keeps a shallow copy of `project`, which shares this object, so the
// count it sends is always the current one
const { files, filesLoaded, loadFiles } = useBatchedFiles({ shortname: project.shortname, filesTotal });
project.filesLoaded = filesLoaded;

// The volume layers' label sets as last saved: when one changes, saving
// first checks that the new label set has a label for every value the
// layer's annotations use, and asks for a confirmation if it does not
const annotationsList = (p) => (p && p.annotations && p.annotations.list) || [];
const copyAnnotations = (p) => JSON.parse(JSON.stringify(annotationsList(p)));
let savedAnnotations = copyAnnotations(project);

/**
 * Ask the server what each label set change would do to the layer's annotations
 * @param {Array<{name: string, values: string}>} changes The layers whose label set changed
 * @returns {Promise<Array<object|null>>} The answers, null for a request that failed
 */
const checkLabelsets = (changes) => Promise.all(changes.map(async ({ name, values }) => {
  try {
    const res = await fetch(`/project/json/${encodeURIComponent(project.shortname)}/labelset-check?layer=${encodeURIComponent(name)}&values=${encodeURIComponent(values)}`);

    return res.ok ? await res.json() : null;
  } catch (err) {
    console.warn('Could not check the label set of layer', name, err);

    return null;
  }
}));

/**
 * Called by SettingsPage (nwl-components) when "Save Changes" is clicked,
 * before it saves: if a volume layer's label set changed to one that has no
 * label for some of the values its annotations use, ask for a confirmation
 * @param {Object} edited The project being edited
 * @returns {Promise<boolean>} false to cancel the save
 */
const beforeSaveProject = async (edited) => {
  const changes = changedVolumeLabelsets(savedAnnotations, annotationsList(edited));
  if (changes.length > 0) {
    const warning = labelsetWarning((await checkLabelsets(changes)).filter(Boolean));
    // eslint-disable-next-line no-alert
    if (warning && !window.confirm(warning)) { return false; }
  }
  savedAnnotations = copyAnnotations(edited);

  return true;
};

const PageContents = {
  template: `
    <SettingsPage :project="project" :files="files" />
  `,
  setup() {
    return {
      project,
      files
    };
  },
  mounted() {
    loadFiles();
  }
};
const app = createApp(PageContents);
app.component('SettingsPage', SettingsPage);
app.provide('config', { ...config, beforeSaveProject });
app.provide('user', loggedUser);

app.mount('#app');
