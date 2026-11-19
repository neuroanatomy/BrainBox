/* global loggedUser */
import 'nwl-components/dist/style.css';
import '../style/tables.css';
import { Button, Footer, Header, Table, Wrapper } from 'nwl-components';
import { computed, createApp, onMounted, ref } from 'vue';
import config from '../nwl-components-config';

const fetchJSON = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = { success: false, error: `${res.status} ${res.statusText}` };
  }
  if (!res.ok || body.success === false) {
    throw new Error(body.error || body.msg || `${res.status} ${res.statusText}`);
  }

  return body;
};

const postJSON = (url, data) => fetchJSON(url, { method: 'POST', body: JSON.stringify(data) });

const mriLink = (source) => '/mri?url=' + encodeURIComponent(source);

const formatDate = (date) => (date ? String(date).slice(0, 10) : '');

const AdminPage = {
  template: '#template',
  delimiters: ['[[', ']]'],
  // eslint-disable-next-line max-statements
  setup() {
    const orphans = ref([]);
    const orphansLoading = ref(false);
    const orphansError = ref('');
    const orphansResult = ref('');
    const expanded = ref({});

    const mriURL = ref(new URLSearchParams(window.location.search).get('url') || '');
    const mri = ref(null);
    const mriLoading = ref(false);
    const mriError = ref('');
    const mriResult = ref('');
    const selectedVolume = ref([]);
    const selectedText = ref([]);
    const selectProject = ref('');

    const damaged = ref(null); // null until searched
    const damagedLoading = ref(false);
    const damagedError = ref('');
    const damagedResult = ref('');
    const damagedExpanded = ref({});

    const message = ref('');
    const serverResult = ref('');

    const loadOrphans = async () => {
      orphansLoading.value = true;
      orphansError.value = '';
      try {
        orphans.value = (await fetchJSON('/admin/json/orphans')).list;
      } catch (err) {
        orphansError.value = err.message;
      }
      orphansLoading.value = false;
    };

    const loadDamaged = async () => {
      damagedLoading.value = true;
      damagedError.value = '';
      try {
        damaged.value = (await fetchJSON('/admin/json/projects/damaged')).list;
      } catch (err) {
        damagedError.value = err.message;
      }
      damagedLoading.value = false;
    };

    const toggleDamaged = (shortname) => {
      damagedExpanded.value = { ...damagedExpanded.value, [shortname]: !damagedExpanded.value[shortname] };
    };

    // What is wrong with a damaged project
    const problems = (p) => [
      ...(p.suspected ? ['incomplete save'] : []),
      ...(p.missing && !p.suspected ? ['files removed'] : []),
      ...(p.currentVersions.length > 1 ? [`${p.currentVersions.length} current versions`] : [])
    ];

    // Post a fix, then search again. An error (a 409 for a project changed
    // since it was listed, with the version token of the list) stays shown
    // above the list searched again, with the project's new token
    const fixDamaged = async (fn) => {
      damagedResult.value = '';
      damagedError.value = '';
      let error = '';
      try {
        damagedResult.value = await fn();
      } catch (err) {
        ({ message: error } = err);
      }
      await loadDamaged();
      if (error) {
        damagedError.value = error;
      }
    };

    const restoreFiles = (p, e) => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Add back to "${p.shortname}" the ${e.stillMissing} file(s) that the save of ${formatDate(e.modified)} removed?`)) {
        return;
      }

      return fixDamaged(async () => {
        const { restored, files } = await postJSON('/admin/json/projects/restore-files', { project: p.shortname, version: p.version, save: e.save });

        return `${p.shortname}: restored ${restored} file(s), it has ${files} now.`;
      });
    };

    const fixCurrent = (p) => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`"${p.shortname}" has ${p.currentVersions.length} current versions: keep the most recent one, and make the others backups?`)) {
        return;
      }

      return fixDamaged(async () => {
        const { backups } = await postJSON('/admin/json/projects/fix-current', { project: p.shortname, version: p.version });

        return `${p.shortname}: kept the most recent version, ${backups} other(s) made backups.`;
      });
    };

    const loadMRI = async () => {
      mriLoading.value = true;
      mriError.value = '';
      mriResult.value = '';
      selectedVolume.value = [];
      selectedText.value = [];
      try {
        mri.value = await fetchJSON('/admin/json/mri?url=' + encodeURIComponent(mriURL.value));
        const url = new URL(window.location.href);
        url.searchParams.set('url', mriURL.value);
        window.history.replaceState(null, '', url);
      } catch (err) {
        mri.value = null;
        mriError.value = err.message;
      }
      mriLoading.value = false;
    };

    const inspect = (source) => {
      mriURL.value = source;
      loadMRI();
      document.getElementById('mri').scrollIntoView();
    };

    const toggle = (project) => {
      expanded.value = { ...expanded.value, [project]: !expanded.value[project] };
    };

    // Projects of the volume annotations of the MRI, with how many annotations each
    const volumeProjects = computed(() => {
      const counts = new Map();
      for (const a of (mri.value ? mri.value.volume : [])) {
        const key = a.project || '';
        counts.set(key, (counts.get(key) || 0) + 1);
      }

      return [...counts.entries()].map(([key, count]) => ({ key: key === '' ? '\u0000' : key, label: key || '(none)', count }));
    });

    const selectByProject = () => {
      const project = selectProject.value === '\u0000' ? '' : selectProject.value;
      const files = mri.value.volume.filter((a) => (a.project || '') === project).map((a) => a.filename);
      selectedVolume.value = [...new Set([...selectedVolume.value, ...files])];
      selectProject.value = '';
    };

    const removeSelected = async () => {
      const nv = selectedVolume.value.length;
      const nt = selectedText.value.length;
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Remove ${nv} volume and ${nt} text annotation(s) from ${mri.value.name || mri.value.source}?`)) {
        return;
      }
      try {
        const { removed } = await postJSON('/admin/json/mri/remove-annotations', {
          url: mri.value.source,
          volume: selectedVolume.value,
          text: selectedText.value
        });
        await loadMRI();
        mriResult.value = `Removed ${removed.volume.length} volume and ${removed.text.length} text annotation(s).`;
      } catch (err) {
        mriError.value = err.message;
      }
    };

    const removeOrphans = async (o) => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Remove all the annotations of project "${o.project}" from ${o.mris.length} MRI(s)?`)) {
        return;
      }
      orphansResult.value = '';
      try {
        const { removed, skipped } = await postJSON('/admin/json/orphans/remove', { project: o.project });
        orphansResult.value = `"${o.project}": cleaned ${removed.length} MRI(s).`
          + (skipped.length ? ` Skipped ${skipped.length} MRI(s) open by someone: ${skipped.join(', ')}` : '');
        await loadOrphans();
      } catch (err) {
        orphansError.value = err.message;
      }
    };

    const broadcast = async () => {
      try {
        serverResult.value = (await postJSON('/admin/broadcast-message', { msg: message.value })).msg;
        message.value = '';
      } catch (err) {
        serverResult.value = err.message;
      }
    };

    const saveAll = async () => {
      try {
        serverResult.value = (await postJSON('/admin/save-all-atlases', {})).msg;
      } catch (err) {
        serverResult.value = err.message;
      }
    };

    onMounted(() => {
      loadOrphans();
      if (mriURL.value) { loadMRI(); }
    });

    return {
      orphans,
      orphansLoading,
      orphansError,
      orphansResult,
      expanded,
      mriURL,
      mri,
      mriLoading,
      mriError,
      mriResult,
      selectedVolume,
      selectedText,
      selectProject,
      volumeProjects,
      damaged,
      damagedLoading,
      damagedError,
      damagedResult,
      damagedExpanded,
      loadDamaged,
      toggleDamaged,
      problems,
      restoreFiles,
      fixCurrent,
      message,
      serverResult,
      loadOrphans,
      loadMRI,
      inspect,
      toggle,
      selectByProject,
      removeSelected,
      removeOrphans,
      broadcast,
      saveAll,
      mriLink,
      formatDate
    };
  }
};

const app = createApp(AdminPage);
app.component('Wrapper', Wrapper);
app.component('Header', Header);
app.component('Footer', Footer);
app.component('Table', Table);
app.component('Button', Button);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
