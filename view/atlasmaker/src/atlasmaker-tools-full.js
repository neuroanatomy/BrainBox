/*
  The viewer's full toolbar (T002 K2c): nwl-components' toolsFrame (3.9.0), shared with
  microdraw, holding BrainBox's own slider, buttons and pen size, then BrainBox's panels.
  Those stay BrainBox's own html files (html/toolsFullSlider.html, toolsFullButtons.html,
  toolsFullPenSize.html and toolsFull.html), turned into strings by html-loader. The result is
  inserted with insertAdjacentHTML (atlasmaker.js): it holds only the library's markup and those
  files, never user data, so keep it that way.
*/

import barsIcon from 'nwl-components/dist/icons/bars.svg';
import caretLeftIcon from 'nwl-components/dist/icons/caret-square-o-left.svg';
import caretRightIcon from 'nwl-components/dist/icons/caret-square-o-right.svg';
import panels from './html/toolsFull.html';
import penSize from './html/toolsFullPenSize.html';
import timesCircleIcon from 'nwl-components/dist/icons/times-circle.svg';
import toolsButtons from './html/toolsFullButtons.html';
import { toolsFrame } from 'nwl-components/chat';
import toolsSlider from './html/toolsFullSlider.html';

// The frame's icons, bundled by url-loader as html-loader did for their
// `~nwl-components/dist/icons/…` paths, so they are the same URLs as before.
const icons = {
  'bars': barsIcon,
  'times-circle': timesCircleIcon,
  'caret-square-o-left': caretLeftIcon,
  'caret-square-o-right': caretRightIcon
};

export const toolsFull = toolsFrame({
  iconUrl: (name) => icons[name],
  slider: toolsSlider,
  buttons: toolsButtons,
  extra: penSize
}) + panels;
