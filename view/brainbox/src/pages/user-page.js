/* globals nickname, loggedUser */
import 'nwl-components/dist/style.css';
import { Tab, Table, Tabs, UserPage } from 'nwl-components';
import { computed, createApp, ref } from 'vue';
import config from '../nwl-components-config';

const sortKeys = {
  Name: 'project',
  Files: 'numFiles',
  Collaborators: 'numCollaborators',
  Owner: 'owner',
  'Last modified': 'modified'
};

const PageContents = {
  template: '#template',
  setup() {
    const projects = ref([]);
    const sortColumn = ref(null);
    const sortAsc = ref(true);

    const sortedProjects = computed(() => {
      if (!sortColumn.value) {
        return projects.value;
      }
      const key = sortKeys[sortColumn.value];
      const dir = sortAsc.value ? 1 : -1;

      return [...projects.value].sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (typeof va === 'number' && typeof vb === 'number') {
          return dir * (va - vb);
        }

        return dir * String(va).localeCompare(String(vb));
      });
    });

    const sortBy = (column) => {
      if (sortColumn.value === column) {
        sortAsc.value = !sortAsc.value;
      } else {
        sortColumn.value = column;
        sortAsc.value = true;
      }
    };

    const sortIndicator = (column) => {
      if (sortColumn.value !== column) { return ''; }

      return sortAsc.value ? ' ▲' : ' ▼';
    };

    return {
      projects,
      sortedProjects,
      sortBy,
      sortIndicator
    };
  },
  mounted() {
    let cursorProjects = 0;
    const url = new URL(
      `/user/json/${nickname}/projects`,
      window.location.protocol + '//' + window.location.host
    );
    const fetchProjects = async () => {
      const params = {
        start: cursorProjects,
        length: 100
      };
      url.search = new URLSearchParams(params).toString();
      const res = await (await fetch(url)).json();
      if (res.success & (res.list.length > 0)) {
        this.projects.push(...res.list);
        cursorProjects += 100;
        fetchProjects();
      }
    };
    fetchProjects();
  },
  compilerOptions: {
    delimiters: ['[[', ']]']
  }
};
const app = createApp(PageContents);
app.component('UserPage', UserPage);
app.component('Tabs', Tabs);
app.component('Tab', Tab);
app.component('Table', Table);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
