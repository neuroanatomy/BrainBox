/*
  Sortable plain tables (the project page's files, the MRI page's volume and text
  annotations), with nwl-components/sort only (no Vue): the headers get SortableTh's
  markup (th.nwl-sortable > button.nwl-sort-button > label + icon, aria-sort; Enter and
  Space work as on any button) and look (nwl-components/sort/style.css, which has only
  the th.nwl-sortable and .nwl-sort-* rules), the rows sortRows' order (strings with
  localeCompare, dates, missing values last both ways). A click on a header sorts
  ascending, a second click reverses. Unsorted until a header is clicked: the data order.

  A row is its data, not its position: each tbody row carries its index in its data
  array in data-index (BrainBox.appendAnnotationTableRow sets it), and the pages look
  rows up by it. Sorting moves the rows, whose bindings hold their cells, not their
  positions; the data arrays are never reordered.
*/
import 'nwl-components/sort/style.css';
import { nextSort, sortRows, sortableHeader } from 'nwl-components/sort';

/**
 * The index in its data array of the data a table row shows
 * @param {Element|null} tr The row
 * @returns {number} Its data index, -1 for none (no row, or a header row)
 */
export const rowIndex = (tr) => {
  const index = (tr && tr.dataset) ? parseInt(tr.dataset.index, 10) : NaN;

  return Number.isInteger(index) ? index : -1;
};

/**
 * The text a cell shows, as a sort key
 * @param {number} col The cell's column
 * @returns {function} tr => the text of its cell in that column
 */
export const cellText = (col) => (tr) => (tr.cells[col] ? tr.cells[col].textContent : null);

/**
 * Make a table's columns sortable. Rows appended later are put at their sorted place
 * with `place`. The order changes only then and on a header click: a cell being edited
 * does not move.
 * @param {HTMLTableElement} table The table, with its header row in a thead
 * @param {Array<object|null>} columns For each header, by position: the sortRows column
 *   ({ key: tr => value, type }) to sort by, or null if it is not sortable
 * @returns {object} { place(tr): put an appended row at its sorted place }
 */
export const makeSortable = (table, columns) => {
  const tbody = table.querySelector('tbody');
  let state = { column: null, ascending: true };
  const headers = [];

  const direction = (col) => {
    if (state.column !== col) {
      return 'none';
    }

    return state.ascending ? 'ascending' : 'descending';
  };
  // the rows in the order of their data, then sorted by the current column
  const sorted = () => {
    const rows = [...tbody.rows].sort((a, b) => rowIndex(a) - rowIndex(b));

    return (state.column === null) ? rows : sortRows(rows, columns[state.column], state.ascending);
  };
  const render = () => {
    for (const tr of sorted()) {
      tbody.appendChild(tr);
    }
    headers.forEach((header, col) => { if (header) { header.setDirection(direction(col)); } });
  };

  table.querySelectorAll('thead th').forEach((th, col) => {
    if (columns[col]) {
      headers[col] = sortableHeader(th, {
        onSort: () => {
          state = nextSort(state, col);
          render();
        }
      });
    }
  });

  /**
   * Put a row just appended at its sorted place, without moving the others: before
   * the first shown row it sorts before (a binary search, the shown rows being sorted
   * but for the edits made since the last sort). Unsorted, it stays last.
   * @param {HTMLTableRowElement} tr The row
   * @returns {void}
   */
  const place = (tr) => {
    if (!tr || state.column === null) {
      return;
    }
    const column = columns[state.column];
    const others = [...tbody.rows].filter((row) => row !== tr);
    let lo = 0;
    let hi = others.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (sortRows([others[mid], tr], column, state.ascending)[0] === tr) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    tbody.insertBefore(tr, others[lo] || null);
  };

  return { place };
};
