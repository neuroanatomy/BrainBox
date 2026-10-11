/* global project, filesTotal, loggedUser */

import 'nwl-components/dist/style.css';
import { createApp, reactive } from 'vue';
import { SettingsPage } from 'nwl-components';
import config from '../nwl-components-config';

const BATCH_LENGTH = 100;
const RETRY_DELAYS = [500, 1000]; // ms before trying a failed batch again

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Fetch a batch of the project's files (only their source and name),
 * trying again after each of the RETRY_DELAYS if the request fails.
 * @param {number} start Index of the first file
 * @param {number} attempt Number of attempts already made
 * @returns {Promise<Array>} The files
 */
const fetchBatch = async (start, attempt = 0) => {
  try {
    const res = await fetch(`/project/json/${project.shortname}/files?start=${start}&length=${BATCH_LENGTH}&names=true`);
    if (!res.ok) {
      throw new Error(`the server answered with status ${res.status}`);
    }
    const list = await res.json();
    if (!Array.isArray(list)) {
      throw new Error('the server did not send a list of files');
    }

    return list;
  } catch (err) {
    if (attempt >= RETRY_DELAYS.length) {
      throw err;
    }
    await delay(RETRY_DELAYS[attempt]);

    return fetchBatch(start, attempt + 1);
  }
};

// Files received so far: kept out of Vue's reactivity, they can be thousands
const files = [];
const state = reactive({ received: 0, loading: false, loaded: false, error: null });

/**
 * Fetch the batches of files from the last one received, until a batch is not full
 * @returns {Promise<void>} Resolves once all the files have been received
 */
const fetchRemainingFiles = async () => {
  let list;
  do {
    // eslint-disable-next-line no-await-in-loop
    list = await fetchBatch(files.length);
    files.push(...list);
    state.received = files.length;
  } while (list.length === BATCH_LENGTH);
};

/**
 * Load the project's files. The settings are only shown once the list is complete:
 * saving a partial list would remove the files that had not arrived yet.
 * @returns {Promise<void>} Resolves once the files are loaded, or failed to load
 */
const loadFiles = async () => {
  if (state.loading) { return; }
  state.loading = true;
  state.error = null;
  try {
    // a new project, or one without files, has nothing to fetch
    if (filesTotal > 0) {
      await fetchRemainingFiles();
    }
    project.files.list = files;
    project.filesLoaded = files.length; // checked by the server when saving
    state.loaded = true;
  } catch (err) {
    state.error = err.message;
  } finally {
    state.loading = false;
  }
};

const PageContents = {
  template: `
    <SettingsPage v-if="state.loaded" :project="project" />
    <div v-else class="app">
      <div class="filesLoading">
        <p>Loading files… {{ state.received }} / {{ total }}</p>
        <progress :value="state.received" :max="total"></progress>
        <p v-if="state.error" class="filesLoadingError">
          Could not load the files: {{ state.error }}.
          <button @click="retry">Retry</button>
        </p>
      </div>
    </div>
  `,
  setup() {
    return {
      project,
      state,
      retry: loadFiles
    };
  },
  computed: {
    total() {
      return Math.max(filesTotal, state.received);
    }
  },
  mounted() {
    loadFiles();
  }
};
const app = createApp(PageContents);
app.component('SettingsPage', SettingsPage);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
