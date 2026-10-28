/* globals nickname, loggedUser */
import 'nwl-components/dist/style.css';
import '../style/tables.css';
import { SortableTh, Tab, Table, Tabs, UserPage, useSortable } from 'nwl-components';
import { createApp, ref } from 'vue';
import config from '../nwl-components-config';

const PageContents = {
  template: '#template',
  setup() {
    const projects = ref([]);
    // unsorted until a header is clicked: the server's order
    const sort = useSortable(projects, {
      Name: { key: 'project' },
      Files: { key: 'numFiles', type: 'number' },
      Collaborators: { key: 'numCollaborators', type: 'number' },
      Owner: { key: 'owner' },
      'Last modified': { key: 'modified', type: 'date' }
    });

    return {
      projects,
      sort,
      sortedProjects: sort.sortedRows
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
app.component('SortableTh', SortableTh);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
