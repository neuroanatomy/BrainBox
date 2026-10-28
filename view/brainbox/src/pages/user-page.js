/* globals nickname, loggedUser */
import 'nwl-components/dist/style.css';
import '../style/tables.css';
import { SortableTh, Tab, Table, Tabs, UserPage, useSortable } from 'nwl-components';
import { createApp, ref } from 'vue';
import config from '../nwl-components-config';

const pad = (n) => String(n).padStart(2, '0');

// An ISO date as a local YYYY-MM-DD (dateTime: YYYY-MM-DD HH:MM:SS), '' when
// missing or not a date
const localDate = (iso, dateTime = false) => {
  const d = new Date(iso);
  if (!iso || isNaN(d)) {
    return '';
  }
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  return dateTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : date;
};

// What the Name column shows, and sorts by: the project's display name, or its
// short name when the display name is missing or empty
const shownName = (project) => {
  const name = typeof project.projectName === 'string' ? project.projectName.trim() : '';

  return name === '' ? project.project : project.projectName;
};

const PageContents = {
  template: '#template',
  setup() {
    const projects = ref([]);
    // unsorted until a header is clicked: the server's order
    const sort = useSortable(projects, {
      Name: { key: 'shownName' },
      Files: { key: 'numFiles', type: 'number' },
      Collaborators: { key: 'numCollaborators', type: 'number' },
      Owner: { key: 'owner' },
      'Last modified': { key: 'modified', type: 'date' }
    });

    return {
      projects,
      sort,
      sortedProjects: sort.sortedRows,
      localDate
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
        this.projects.push(...res.list.map((project) => ({ ...project, shownName: shownName(project) })));
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
app.component('SortableTh', SortableTh);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
