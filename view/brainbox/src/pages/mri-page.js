/* eslint-disable max-lines */
/*global AtlasMakerWidget BrainBox infoProxy mriInfo params*/
import '../style/style.css';
import '../style/textAnnotations.css';
import '../style/ui.css';
import '../style/mri-style.css';
import '../style/access-style.css';
import '../style/dropdown-style.css';

import 'jquery-ui/themes/base/core.css';
import 'jquery-ui/themes/base/theme.css';
import 'jquery-ui/themes/base/autocomplete.css';
import 'jquery-ui/ui/core';
import 'jquery-ui/ui/widgets/autocomplete';

import * as tw from '../twoWayBinding';

import $ from 'jquery';

// let mriInfoOrig;
let textAnnotationsArray = [];
let volAnnParam;
let textAnnParam;

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
$('body').on('touchstart', (e) => {
  const t2 = e.timeStamp;
  const t1 = $(e.currentTarget).data('lastTouch') || t2;
  const dt = t2 - t1;
  const fingers = e.originalEvent.touches.length;
  $(e.currentTarget).data('lastTouch', t2);
  if (!dt || dt > 500 || fingers > 1) {
    return; // not double-tap
  }
  e.preventDefault(); // double tap - prevent the zoom
  // also synthesize click events we just swallowed up
  $(e.currentTarget).trigger('click')
    .trigger('click');
});

if ($.isEmptyObject(mriInfo)) {
  $('#stereotaxic').prepend('<h2>ERROR: Cannot read the data.</h2><p>The file is maybe corrupt?</p>');
  console.log('ERROR: Cannot read data. The file is maybe corrupt?');

  $('#annotationsPane').hide();
  $('#data').show();

} else {
  params.info = mriInfo;

  // const fullscreen = false;
  if (params.fullscreen) { params.fullscreen = (params.fullscreen === 'true'); }

  $('#loadingIndicator').show();

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
      tw.bind2(infoProxy, BrainBox.info, 'name', $('#name'));
      tw.bind1(infoProxy, BrainBox.info, 'source', $('#source'));
      tw.bind1(infoProxy, BrainBox.info, 'included', $('#included'), tw.dateFormat);


      // Bind volume-type annotations
      //------------------------------
      volAnnParam = {
        table: $('table#annotations'),
        infoProxy: infoProxy,
        info: BrainBox.info,
        trTemplate: $.map([
          '<tr>',
          ' <td class=\'noEmpty\'></td>', // name
          ' <td><select>', $.map(BrainBox.labelSets, (o) => '<option>' + o.name + '</option>'), '</select></td>', // value
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
        ], (o) => o).join(''),
        objTemplate: [
          {
            typeOfBinding: 2,
            path: 'mri.atlas.#.name' // name
          },
          {
            typeOfBinding: 2,
            path: 'mri.atlas.#.labels', //value
            format: (e, d) => {
              $(e).find('select')
                .prop('selectedIndex', $.map(BrainBox.labelSets, (o) => o.source).indexOf(d));
            },
            parse: (e) => {
              const name = $(e).find('select')
                .val();
              const i = $.map(BrainBox.labelSets, (o) => o.name).indexOf(name);

              return BrainBox.labelSets[i].source;
            }
          },
          {
            typeOfBinding: 1, // project
            path: 'mri.atlas.#.project',
            format: (e, d) => { $(e).html('<a href="/project/' + d + '">' + d + '</a>'); }
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
              $(e).find('.access')
                .attr('data-level', ['none', 'view', 'edit', 'add', 'remove'].indexOf(d));
            },
            parse: (e) => {
              const level = $(e).find('.access')
                .attr('data-level');

              return ['none', 'view', 'edit', 'add', 'remove'][level];
            }
          }
        ]
      };
      for (let i = 0; i < BrainBox.info.mri.atlas.length; i++) {
        BrainBox.appendAnnotationTableRow(i, volAnnParam);
      }
      // connect pop-down menus
      $(document).on('change', 'table#annotations select', (e) => {
        const col = $('table#annotations tr:eq(0) th:eq(' + $(e.currentTarget).closest('td')[0].cellIndex + ')').text();
        const index = $(e.currentTarget).closest('tr')[0].rowIndex - 1;
        switch (col) {
        case 'Value': {
          const url = '/labels/' + infoProxy['mri.atlas.' + index + '.labels'];
          $.getJSON(url, (json) => {
            AtlasMakerWidget.configureOntology(json);
            AtlasMakerWidget.changePenColor(0);
            AtlasMakerWidget.brainImg.img = null; // to force redraw with new colors
            AtlasMakerWidget.drawImages();
            $('#loadingIndicator').hide();
          });
          break;
        }
        }
      });
      // volume annotation table: select row
      $(document).on('click touchstart', '#annotations tr', (e) => {
        const targetRow = $(e.target).closest('tr');
        const targetIndex = targetRow.index();
        BrainBox.selectAnnotationTableRow(targetIndex, volAnnParam);
      });
      // volume annotations table: select the first row by default
      $('table#annotationsg').removeClass('selected');
      $('table#annotations tr').eq(1)
        .addClass('selected');

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
          format: (e, d) => { $(e).html('<a href="/project/' + d + '">' + d + '</a>'); }
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
            $(e).find('.access')
              .attr('data-level', BrainBox.accessLevels.indexOf(d));
          },
          parse: (e) => {
            const level = $(e).find('.access')
              .attr('data-level');

            return BrainBox.accessLevels[level];
          }
        }
      ];

      textAnnParam = {
        table: $('table#textAnnotations'),
        infoProxy: infoProxy,
        info: textAnnotationsArray,
        trTemplate: trTemplate,
        objTemplate: objTemplate
      };

      for (let i = 0; i < textAnnotationsArray.length; i++) {
        BrainBox.appendAnnotationTableRow(i, textAnnParam);
      }

      // text annotations table: select the first row by default
      $('table#textAnnotations tr').removeClass('selected');
      $('table#textAnnotations tr').eq(1)
        .addClass('selected');

      // connect close button in labels set
      $(document).on('click touchstart', '#labels-close', () => { $('#labelset').hide(); });

      $('#data').show();

      // WS Autocompletion
      //-------------------
      let cb, label;
      AtlasMakerWidget.receiveFunctions.similarProjectNamesQuery = (data) => {
        let arr = [];
        if (label === 'similarProjectNames') { arr = $.map(data.metadata, (o) => ({ label: o.shortname, shortname: o.shortname, name: o.name })); }
        cb(arr);
      };

      $('.autocomplete').autocomplete({
        minLength: 0,
        source: (req, res) => {
          // eslint-disable-next-line no-invalid-this
          const key = $(this.element).attr('data-autocomplete');
          switch (key) {
          case 'user.similarProjectNames':
            AtlasMakerWidget.socket.send(JSON.stringify({ 'type': 'similarProjectNamesQuery', 'metadata': { 'projectName': req.term } }));
            label = 'similarProjectNames';
            break;
          }
          cb = res;
        },
        select: (e, ui) => {
          const irow = $(e.target).closest('tr')
            .index();
          infoProxy['mri.atlas.' + irow + '.project'] = ui.item.name;

          // add user to access objects
          // projectInfo.collaborators.list[irow].userID=ui.item.nickname;
        }
      });

    })
    .catch((err) => {
      $('#msgLog').html('ERROR: Can\'t load data. ' + err);
      console.error(err);
    });
}

$('#addProject').click(() => { location = '/project/new'; });
