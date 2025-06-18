// script.js

// configuration
const CSV_GRID_PATH  = 'xxxx.csv';
const CSV_CLUES_PATH = 'clues.csv';

let solution     = [];      // 2D array of letters/'1'
let cellNumbers  = [];      // same shape as solution, holds clue numbers
let CLUES        = { across: {}, down: {} };
let orientation  = 'across'; // 'across' or 'down'

document.addEventListener('DOMContentLoaded', () => {
  // 1) Fetch grid & clues
  Promise.all([
    fetch(CSV_GRID_PATH).then(r => r.text()),
    fetch(CSV_CLUES_PATH).then(r => r.text())
  ])
  .then(([gridText, cluesText]) => {
    parseClues(cluesText);
    buildGrid(gridText);
    console.log(gridText);
  })
  .catch(err => console.error('CSV load error:', err));

  // 2) Wire up buttons
  document.getElementById('check-btn').addEventListener('click', checkAnswers);
  //document.getElementById('clear-btn').addEventListener('click', clearPuzzle);

  // NEW: Fill‐in test button
  //document.getElementById('fill-btn').addEventListener('click', fillAnswers);


  // 3) Size clues panel
  window.addEventListener('load',   adjustCluesSize);
  window.addEventListener('resize', adjustCluesSize);
});

/** Parse clues.csv into CLUES.across and CLUES.down */
function parseClues(csvText) {
  CLUES = { across: {}, down: {} };
  const lines = csvText.trim().split('\n');
  lines.shift(); // drop header
  for (let line of lines) {
    const parts    = line.split(',');
    const dir      = parts[0].trim().toLowerCase();
    const num      = parseInt(parts[1].trim(), 10);
    const clueText = parts.slice(2).join(',').trim();
    if (dir === 'across' || dir === 'down') {
      CLUES[dir][num] = clueText;
    }
  }
}

/** Build crossword grid and clues */
function buildGrid(csvText) {
  // parse grid
  const rows = csvText.trim().split('\n').map(line =>
    line.split(',').map(cell => cell.trim().toUpperCase())
  );
  solution = rows;
  const R = rows.length, C = rows[0].length;

  // prepare clue number queues
  const acrossNums = Object.keys(CLUES.across).map(n => +n).sort((a,b)=>a-b);
  const downNums   = Object.keys(CLUES.down  ).map(n => +n).sort((a,b)=>a-b);

  // number only cells for which you have clues
  const numbers = Array.from({ length: R }, () => Array(C).fill(null));
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (rows[r][c] === '1') continue;
      const startA = (c===0 || rows[r][c-1]==='1')
                   && (c+1<C && rows[r][c+1]!=='1');
      const startD = (r===0 || rows[r-1][c]==='1')
                   && (r+1<R && rows[r+1][c]!=='1');
      if (startA && acrossNums.length) {
        numbers[r][c] = acrossNums.shift();
      }
      if (startD && downNums.length) {
        if (numbers[r][c] == null) numbers[r][c] = downNums.shift();
        else downNums.shift(); // shared cell, consume but don’t overwrite
      }
    }
  }
  cellNumbers = numbers;

  // build table
  const tbl = document.createElement('table');
  tbl.classList.add('crossword');
  rows.forEach((row, r) => {
    const tr = document.createElement('tr');
    row.forEach((cell, c) => {
      const td = document.createElement('td');
      if (cell === '1') {
        td.classList.add('black');
      } else {
        // number label
        if (numbers[r][c] != null) {
          const div = document.createElement('div');
          div.classList.add('cell-number');
          div.textContent = numbers[r][c];
          td.appendChild(div);
        }
        // input cell
        const inp = document.createElement('input');
        inp.maxLength = 1;
        inp.dataset.row = r;
        inp.dataset.col = c;
        inp.addEventListener('input', onCellInput);
        inp.addEventListener('keydown', onCellKeydown);
        inp.addEventListener('focus', () => highlightWord(r, c));
        inp.addEventListener('click', () => {
          orientation = (orientation === 'across') ? 'down' : 'across';
          highlightWord(r, c);
        });
        td.appendChild(inp);
      }
      tr.appendChild(td);
    });
    tbl.appendChild(tr);
  });
  const gridContainer = document.getElementById('grid-container');
  gridContainer.innerHTML = '';
  gridContainer.appendChild(tbl);

  // render clues & size panels
  displayClues(numbers);
  adjustCluesSize();
}

/** Populate Across/Down lists with <li data-num> tags */
function displayClues(numbers) {
  const acrossUL = document.getElementById('across-list');
  const downUL   = document.getElementById('down-list');
  acrossUL.innerHTML = '';
  downUL.innerHTML   = '';

  const R = solution.length, C = solution[0].length;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const num = numbers[r][c];
      // across start?
      if (num!=null && (c===0||solution[r][c-1]==='1') && (c+1<C&&solution[r][c+1]!=='1')) {
        const li = document.createElement('li');
        li.dataset.num = num;
        li.dataset.dir = 'across';
        let text = CLUES.across[num] || '';
        if (!/^\s*\d+\./.test(text)) text = `${num}. ${text}`;
        li.textContent = text;
        li.addEventListener('click', () => {
          orientation = 'across';
          focusAndHighlight(r, c);
        });
        acrossUL.appendChild(li);
      }
      // down start?
      if (num!=null && (r===0||solution[r-1][c]==='1') && (r+1<R&&solution[r+1][c]!=='1')) {
        const li = document.createElement('li');
        li.dataset.num = num;
        li.dataset.dir = 'down';
        let text = CLUES.down[num] || '';
        if (!/^\s*\d+\./.test(text)) text = `${num}. ${text}`;
        li.textContent = text;
        li.addEventListener('click', () => {
          orientation = 'down';
          focusAndHighlight(r, c);
        });
        downUL.appendChild(li);
      }
    }
  }
}

/** User input & navigation handlers */
function onCellInput(e) {
  const i = e.target;
  i.value = i.value.toUpperCase().replace(/[^A-Z]/g, '');
  if (i.value.length === 1) {
    const nxt = moveDirectional(i, +1);
    if (nxt) highlightWord(+nxt.dataset.row, +nxt.dataset.col);
  }
  updateClueCompletion();
}
function onCellKeydown(e) {
  const i = e.target;
  const r = +i.dataset.row, c = +i.dataset.col;
  switch (e.key) {
    case 'Backspace':
      e.preventDefault();
      if (i.value) i.value = '';
      else {
        const prev = moveDirectional(i, -1);
        if (prev) {
          prev.value = '';
          highlightWord(+prev.dataset.row, +prev.dataset.col);
        }
      }
      break;
    case 'ArrowLeft':
      e.preventDefault(); focusAndHighlight(r, c-1); break;
    case 'ArrowRight':
      e.preventDefault(); focusAndHighlight(r, c+1); break;
    case 'ArrowUp':
      e.preventDefault(); focusAndHighlight(r-1, c); break;
    case 'ArrowDown':
      e.preventDefault(); focusAndHighlight(r+1, c); break;
  }
  updateClueCompletion();
}
function moveDirectional(inp, d) {
  const r = +inp.dataset.row, c = +inp.dataset.col;
  const nr = orientation==='across'? r: r+d;
  const nc = orientation==='across'? c+d: c;
  return focusCell(nr, nc);
}
function focusAndHighlight(r,c) {
  const nxt = focusCell(r,c);
  if (nxt) highlightWord(r,c);
}
function focusCell(r,c) {
  const sel = `input[data-row="${r}"][data-col="${c}"]`;
  const nex = document.querySelector(sel);
  if (nex) nex.focus();
  return nex;
}

/** Highlight a word and its corresponding clue */
function highlightWord(r,c) {
  clearHighlights();
  clearClueHighlight();

  const isWhite = (rr,cc) =>
    rr>=0 && rr<solution.length &&
    cc>=0 && cc<solution[0].length &&
    solution[rr][cc] !== '1';

  // find word start
  let sr=r, sc=c;
  while (isWhite(
    orientation==='across'? sr: sr-1,
    orientation==='across'? sc-1: sc
  )) {
    if (orientation==='across') sc--; else sr--;
  }

  // highlight cells
  const dr = orientation==='across'?0:1,
        dc = orientation==='across'?1:0;
  let cr=sr, cc= sc;
  while (isWhite(cr,cc)) {
    document.querySelector(`input[data-row="${cr}"][data-col="${cc}"]`)
            .parentElement.classList.add('highlight');
    cr+=dr; cc+=dc;
  }

  // highlight the clue
  const startNum = cellNumbers[sr][sc];
  if (startNum != null) highlightClue(orientation, startNum);
}

/** Clear cell highlights */
function clearHighlights() {
  document.querySelectorAll('td.highlight')
          .forEach(td => td.classList.remove('highlight'));
}

/** Clear only the clue‐highlight (leaving completed crosses intact) */
function clearClueHighlight() {
  document.querySelectorAll('#clues-container li.clue-highlight')
          .forEach(li => li.classList.remove('clue-highlight'));
}

/** Highlight a specific clue <li> */
function highlightClue(dir, num) {
  clearClueHighlight();
  const li = document.querySelector(`#${dir}-list li[data-num="${num}"]`);
  if (li) li.classList.add('clue-highlight');
}

/** Cross/uncross clues based on completion */
function updateClueCompletion() {
  const R = solution.length, C = solution[0].length;
  for (let dir of ['across','down']) {
    for (let numStr in CLUES[dir]) {
      const num = +numStr;
      // locate start cell
      let start = null;
      outer: for (let r=0; r<R; r++) {
        for (let c=0; c<C; c++) {
          if (cellNumbers[r][c] === num &&
              ((dir==='across' && (c===0||solution[r][c-1]==='1')) ||
               (dir==='down'   && (r===0||solution[r-1][c]==='1')))
          ) { start = {r,c}; break outer; }
        }
      }
      if (!start) continue;
      // collect cell values
      const vals = [];
      const dr = dir==='across'?0:1, dc = dir==='across'?1:0;
      let cr=start.r, cc=start.c;
      while (cr>=0&&cr<R&&cc>=0&&cc<C&&solution[cr][cc]!=='1') {
        const inp = document.querySelector(`input[data-row="${cr}"][data-col="${cc}"]`);
        vals.push(inp.value.trim());
        cr+=dr; cc+=dc;
      }
      const completed = vals.every(v=>v.length===1);
      const li = document.querySelector(`#${dir}-list li[data-num="${num}"]`);
      if (li) li.classList.toggle('clue-completed', completed);
    }
  }
}

function checkAnswers() {
  // 1) Clear any existing highlights or feedback
  clearHighlights();
  clearClueHighlight();
  document.querySelectorAll('td')
          .forEach(td => td.classList.remove('correct','incorrect'));

  // 2) Check every cell
  let allCorrect = true;
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[0].length; c++) {
      if (solution[r][c] === '1') continue;
      const inp = document.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
      const val = inp.value.trim().toUpperCase();
      const expected = solution[r][c];
      if (val === expected && val !== '') {
        inp.parentElement.classList.add('correct');
      } else {
        inp.parentElement.classList.add('incorrect');
        allCorrect = false;
      }
    }
  }

  // 3) Update clue crossing state
  updateClueCompletion();

  // 4) Show feedback message
  const msg = document.getElementById('message');
  if (allCorrect) {
    msg.textContent = '🎉 Gratulationes! Crucigramma completum est!';
    msg.classList.remove('error');
    msg.classList.add('success');
  } else {
    msg.textContent = 'Iterum experire.';
    msg.classList.remove('success');
    msg.classList.add('error');
  }

  // 5) After 3 seconds, clear feedback and all markings
  setTimeout(() => {
    msg.textContent = '';
    msg.classList.remove('success', 'error');
    clearHighlights();
    clearClueHighlight();
    document.querySelectorAll('td')
            .forEach(td => td.classList.remove('correct','incorrect'));
  }, 3000);
}



/** Clear the board & reset */
function clearPuzzle() {
  document.querySelectorAll('table.crossword input').forEach(inp=>inp.value='');
  document.querySelectorAll('td').forEach(td=>td.classList.remove('highlight','correct','incorrect'));
  clearClueHighlight();
  document.querySelectorAll('#clues-container li.clue-completed')
          .forEach(li=>li.classList.remove('clue-completed'));
  orientation='across';
  const first = document.querySelector('table.crossword input');
  if (first) first.focus();
}

/** Size the clues panel to match the crossword’s dimensions */
function adjustCluesSize() {
  const grid  = document.getElementById('grid-container');
  const clues = document.getElementById('clues-container');
  if (grid && clues) {
    clues.style.height = grid.clientHeight + 'px';
    clues.style.width  = grid.clientWidth  + 'px';
  }
}
function fillAnswers() {
  // 1) Fill every white cell
  solution.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell !== '1') {
        const inp = document.querySelector(
          `input[data-row="${r}"][data-col="${c}"]`
        );
        if (inp) inp.value = cell;  // already uppercase
      }
    });
  });

  // 2) Update crossing-out
  updateClueCompletion();

  // 3) Trigger the normal check flow (marks correct, shows message)
  checkAnswers();
}