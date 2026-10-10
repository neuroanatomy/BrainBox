/* eslint-disable max-lines */
/*global AtlasMakerWidget BrainBox infoProxy mriInfo params*/
import '../style/style.css';
import '../style/textAnnotations.css';
import '../style/ui.css';
import '../style/mri-style.css';
import '../style/access-style.css';
import '../style/dropdown-style.css';

import * as tw from '../twoWayBinding';
import { getData, setData } from '../../../shared/domData';
import showHideModule from '../../../shared/showHide.js';

// jQuery's .show() / .hide(), without jQuery
const { show, hide } = showHideModule;

// let mriInfoOrig;
let textAnnotationsArray = [];
let volAnnParam;
let textAnnParam;

/**
 * jQuery's $.isEmptyObject: true if the object has no enumerable property, own or inherited
 * @param {object} obj Any object
 * @returns {boolean} Whether it is empty
 */
const isEmptyObject = (obj) => {
  // eslint-disable-next-line guard-for-in, no-unreachable-loop
  for (const name in obj) {
    return false;
  }

  return true;
};

/**
 * jQuery's $.map over an array: like Array.prototype.map, but null and undefined results are dropped
 * @param {array|null} arr The array (null gives [], as with $.map)
 * @param {function} fn The mapping function
 * @returns {array} The mapped values
 */
const jqMap = (arr, fn) => (arr || []).map(fn).filter((v) => v !== null && typeof v !== 'undefined');

/**
 * jQuery's $(document).on(types, selector, handler): call `handler(event, matched)` for events
 * whose target is, or is inside, an element matching `selector`
 * @param {string} types Space-separated event types
 * @param {string} selector CSS selector of the elements to watch
 * @param {function} handler Called with the event and the matched element
 * @returns {void}
 */
const onDocument = (types, selector, handler) => {
  for (const type of types.split(' ')) {
    document.addEventListener(type, (e) => {
      const matched = (e.target instanceof Element) ? e.target.closest(selector) : null;
      if (matched) {
        handler(e, matched);
      }
    });
  }
};

/**
 * Select the n-th row (counting the header) of a table, as $('table... tr').eq(n).addClass('selected')
 * @param {string} rowsSelector Selector of the table's rows
 * @param {number} n Row index
 * @returns {void}
 */
const selectRow = (rowsSelector, n) => {
  const row = document.querySelectorAll(rowsSelector)[n];
  if (row) { row.classList.add('selected'); }
};

const receiveMetadata = function (data) {
  console.log('Received metadata update:', data);
  // const {shortname} = mriInfo;
  // for (var i in mriInfo.files.list) {
  //   if (mriInfo.files.list[i].source === data.metadata.source) {
  //     for (var key in mriInfo.files.list[i].mri.annotations[shortname]) {
  //       if({}.hasOwnProperty.call(mriInfo.files.list[i].mri.annotations[shortname], key)) {
  //         infoProxy["files.list." + i + ".mri.annotations." + shortname + "." + key] = data.metadata.mri.annotations[shortname][key];
  //       }
  //     }
  //     infoProxy["files.list." + i + ".name"] = data.metadata.name;
  //     break;
  //   }
  // }
};


// Prevent zoom on double tap
document.body.addEventListener('touchstart', (e) => {
  const t2 = e.timeStamp;
  const t1 = getData(e.currentTarget, 'lastTouch') || t2;
  const dt = t2 - t1;
  const fingers = e.touches.length;
  setData(e.currentTarget, {lastTouch: t2});
  if (!dt || dt > 500 || fingers > 1) {
    return; // not double-tap
  }
  e.preventDefault(); // double tap - prevent the zoom
  // also synthesize click events we just swallowed up
  e.currentTarget.click();
  e.currentTarget.click();
});

if (isEmptyObject(mriInfo)) {
  const stereotaxic = document.getElementById('stereotaxic');
  if (stereotaxic) { stereotaxic.insertAdjacentHTML('afterbegin', '<h2>ERROR: Cannot read the data.</h2><p>The file is maybe corrupt?</p>'); }
  console.log('ERROR: Cannot read data. The file is maybe corrupt?');

  hide(document.getElementById('annotationsPane'));
  show(document.getElementById('data'));

} else {
  params.info = mriInfo;

  // const fullscreen = false;
  if (params.fullscreen) { params.fullscreen = (params.fullscreen === 'true'); }

  AtlasMakerWidget.setViewerState({ state: 'loading' });

  // Load data
  BrainBox.initBrainBox()
    .then(() => {
      console.log('BrainBox initialised');

      return BrainBox.loadLabelsets();
    })
    .then(() => {
      console.log('Label sets loaded');

      return BrainBox.configureBrainBox(params);
    })
    // eslint-disable-next-line max-statements
    .then(() => {
      console.log('BrainBox configured');

      // Subscribe to metadata changes received by AtlasMaker
      AtlasMakerWidget._metadataChangeSubscribers.push(receiveMetadata);

      // backup the original MRI info
      // value never read
      // mriInfoOrig = JSON.parse(JSON.stringify(BrainBox.info));

      // Serialise text annotations object (text annotations are stored as objects in the
      // database, but used as an array here)
      if (mriInfo.mri && mriInfo.mri.annotations) {
        textAnnotationsArray = BrainBox.annotationsObjectToArray(mriInfo.mri.annotations);
      }

      // Bind general information
      //--------------------------
      tw.bind2(infoProxy, BrainBox.info, 'name', document.getElementById('name'));
      tw.bind1(infoProxy, BrainBox.info, 'source', document.getElementById('source'));
      tw.bind1(infoProxy, BrainBox.info, 'included', document.getElementById('included'), tw.dateFormat);


      // Bind volume-type annotations
      //------------------------------
      volAnnParam = {
        table: document.querySelector('table#annotations'),
        infoProxy: infoProxy,
        info: BrainBox.info,
        trTemplate: [
          '<tr>',
          ' <td class=\'noEmpty\'></td>', // name
          ' <td><select>', jqMap(BrainBox.labelSets, (o) => '<option>' + o.name + '</option>').join(''), '</select></td>', // value
          ' <td class=\'noEmpty\'></td>', // project
          ' <td></td>', // modified
          ' <td>', // access
          '  <div class=\'access\'>',
          '   <span class=\'view\' title=\'view annotations\'></span>',
          '   <span class=\'edit\' title=\'edit annotations\'></span>',
          '   <span class=\'add\' title=\'add annotations\'></span>',
          '   <span class=\'remove\' title=\'remove annotations\'></span>',
          '  </div>',
          ' </td>',
          '</tr>'
        ].join(''),
        objTemplate: [
          {
            typeOfBinding: 2,
            path: 'mri.atlas.#.name' // name
          },
          {
            typeOfBinding: 2,
            path: 'mri.atlas.#.labels', //value
            format: (e, d) => {
              const select = e.querySelector('select');
              if (select) { select.selectedIndex = jqMap(BrainBox.labelSets, (o) => o.source).indexOf(d); }
            },
            parse: (e) => {
              const select = e.querySelector('select');
              const name = select ? select.value : undefined; // eslint-disable-line no-undefined
              const i = jqMap(BrainBox.labelSets, (o) => o.name).indexOf(name);

              return BrainBox.labelSets[i].source;
            }
          },
          {
            typeOfBinding: 1, // project
            path: 'mri.atlas.#.project',
            format: (e, d) => { e.innerHTML = '<a href="/project/' + d + '">' + d + '</a>'; }
          },
          {
            typeOfBinding: 1,
            path: 'mri.atlas.#.modified',
            format: tw.dateFormat
          },
          {
            typeOfBinding: 1,
            path: 'mri.atlas.#.access',
            format: (e, d) => {
              const access = e.querySelector('.access');
              if (access) { access.setAttribute('data-level', ['none', 'view', 'edit', 'add', 'remove'].indexOf(d)); }
            },
            parse: (e) => {
              const access = e.querySelector('.access');
              const level = access ? access.getAttribute('data-level') : undefined; // eslint-disable-line no-undefined

              return ['none', 'view', 'edit', 'add', 'remove'][level];
            }
          }
        ]
      };
      for (let i = 0; i < BrainBox.info.mri.atlas.length; i++) {
        BrainBox.appendAnnotationTableRow(i, volAnnParam);
      }
      // connect pop-down menus
      onDocument('change', 'table#annotations select', (e, select) => {
        // The column's title: the header row's th in the same position as the select's cell
        const [header] = document.querySelectorAll('table#annotations tr');
        const th = header ? header.querySelectorAll('th')[select.closest('td').cellIndex] : null;
        const col = th ? th.textContent : '';
        const index = select.closest('tr').rowIndex - 1;
        switch (col) {
        case 'Value': {
          const url = '/labels/' + infoProxy['mri.atlas.' + index + '.labels'];
          // As with $.getJSON, a failed request is ignored
          fetch(url)
            .then((res) => (res.ok ? res.json().catch(() => null) : null), () => null)
            .then((json) => {
              if (!json) { return; }
              AtlasMakerWidget.configureOntology(json);
              AtlasMakerWidget.changePenColor(0);
              AtlasMakerWidget.brainImg.img = null; // to force redraw with new colors
              AtlasMakerWidget.drawImages();
              AtlasMakerWidget.setViewerState({ state: 'ready' });
            });
          break;
        }
        }
      });
      // volume annotation table: select row
      onDocument('click touchstart', '#annotations tr', (e) => {
        const targetRow = e.target.closest('tr');
        // jQuery's .index(): the row's position among its siblings
        const targetIndex = [...targetRow.parentNode.children].indexOf(targetRow);
        BrainBox.selectAnnotationTableRow(targetIndex, volAnnParam);
      });
      // volume annotations table: select the first row by default
      // (a line deselecting 'table#annotationsg' was dropped here: the selector matched nothing)
      selectRow('table#annotations tr', 1);

      // Bind text annotations
      //-----------------------

      const trTemplate = [
        '<tr>',
        ' <td class=\'noEmpty\'></td>', // name
        ' <td class=\'noEmpty\'></td>', // value
        ' <td class=\'noEmpty\'></td>', // project
        ' <td></td>', // modified
        ' <td>', // access
        '  <div class=\'access\'>',
        '   <span class=\'view\' title=\'view annotations\'></span>',
        '   <span class=\'edit\' title=\'edit annotations\'></span>',
        '   <span class=\'add\' title=\'add annotations\'></span>',
        '   <span class=\'remove\' title=\'remove annotations\'></span>',
        '  </div>',
        ' </td>',
        '</tr>'
      ].join('');

      const objTemplate = [
        {
          typeOfBinding: 2,
          path: '#.name' // name
        },
        {
          typeOfBinding: 2,
          path: '#.data' // value
        },
        {
          typeOfBinding: 1,
          path: '#.project', // project
          format: (e, d) => { e.innerHTML = '<a href="/project/' + d + '">' + d + '</a>'; }
        },
        {
          typeOfBinding: 1,
          path: '#.modified', // modified
          format: tw.dateFormat
        },
        {
          typeOfBinding: 1,
          path: '#.access',
          format: (e, d) => {
            const access = e.querySelector('.access');
            if (access) { access.setAttribute('data-level', BrainBox.accessLevels.indexOf(d)); }
          },
          parse: (e) => {
            const access = e.querySelector('.access');
            const level = access ? access.getAttribute('data-level') : undefined; // eslint-disable-line no-undefined

            return BrainBox.accessLevels[level];
          }
        }
      ];

      textAnnParam = {
        table: document.querySelector('table#textAnnotations'),
        infoProxy: infoProxy,
        info: textAnnotationsArray,
        trTemplate: trTemplate,
        objTemplate: objTemplate
      };

      for (let i = 0; i < textAnnotationsArray.length; i++) {
        BrainBox.appendAnnotationTableRow(i, textAnnParam);
      }

      // text annotations table: select the first row by default
      document.querySelectorAll('table#textAnnotations tr').forEach((tr) => tr.classList.remove('selected'));
      selectRow('table#textAnnotations tr', 1);

      // connect close button in labels set
      onDocument('click touchstart', '#labels-close', () => { hide(document.getElementById('labelset')); });

      show(document.getElementById('data'));

      // (An autocompletion for project names used to be set up here, with jQuery UI, on
      // '.autocomplete' elements; the page has none, so it never ran, and was removed.)
    })
    .catch((err) => {
      const msgLog = document.getElementById('msgLog');
      if (msgLog) { msgLog.innerHTML = 'ERROR: Can\'t load data. ' + err; }
      console.error(err);
    });
}

const addProject = document.getElementById('addProject');
if (addProject) { addProject.addEventListener('click', () => { location = '/project/new'; }); }
