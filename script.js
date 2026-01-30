// BlindType: simple vanishing editor
const title = document.getElementById('title');
const capture = document.getElementById('capture');
const linesEl = document.getElementById('lines');
const status = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const durationInput = document.getElementById('duration');
const visibleLinesSelect = document.getElementById('visibleLines');
const unlockDateInput = document.getElementById('unlockDate');
const saveBtn = document.getElementById('saveBtn');
const MAX_LINE_CHARS = 48
// minimum characters in a committed line before we apply full justification
const MIN_JUSTIFY_CHARS = 48;

let running=false;
let bufferBefore = ''; // committed text (all previous lines)
let currentLine = '';
let timer = null;
let endTime=null;
let visibleLines = parseInt(visibleLinesSelect.value,10);

// used to avoid double-rendering when input + keyup both fire
let skipNextKeyupRender = false;

visibleLinesSelect.addEventListener('change',()=>{visibleLines=parseInt(visibleLinesSelect.value,10); renderLines();});

// keep capture focused
document.getElementById('page').addEventListener('mousedown',(e)=>{capture.focus(); e.preventDefault();});
// also focus when user clicks anywhere
document.addEventListener('click',()=>{if(running) capture.focus();});

function startSession(){
  bufferBefore = '';
  currentLine = '';
  running=true;
  startBtn.style.display='none';
  stopBtn.style.display='inline-block';
  capture.value='';
  capture.focus();
  const minutes = Math.max(1, parseInt(durationInput.value,10)||15);
  endTime = Date.now() + minutes*60000;
  status.textContent = `Running — ${minutes} min`; 
  timer = setInterval(()=>{
    const rem = Math.max(0, Math.floor((endTime - Date.now())/1000));
    const m = Math.floor(rem/60), s = rem%60;
    status.textContent = `Running — ${m}:${String(s).padStart(2,'0')}`;
    if(Date.now()>=endTime){stopSession(true);}
  }, 250);
  renderLines();
}

function stopSession(autosave=false){
  running=false;
  startBtn.style.display='inline-block';
  stopBtn.style.display='none';
  clearInterval(timer);
  status.textContent = 'Stopped';
  // commit currentLine
  bufferBefore += currentLine;
  if(!bufferBefore.endsWith('\n')) bufferBefore+='\n';
  currentLine='';
  capture.value='';
  renderLines();
  if(autosave){
    saveLockedFile();
  }
}


startBtn.addEventListener('click',startSession);
stopBtn.addEventListener('click',()=>stopSession(false));
// Use 'keyup' so the caret/selection has been updated by the browser
// before we read `capture.selectionStart`. Listening on 'keydown' reads
// the position too early (before the default action), causing the
// cursor to appear to lag one keypress behind.
capture.addEventListener('keyup', updateDisplay);
capture.addEventListener('click', updateDisplay);

function updateDisplay() {
  if (skipNextKeyupRender) { skipNextKeyupRender = false; return; }
  currentLine = capture.value;
  const cursorPos = capture.selectionStart;
  renderLines(cursorPos);
}


// keep caret at end of currentLine; only allow editing currentLine
capture.addEventListener('input',(e)=>{
  if(!running) return;
  // sync currentLine with textarea value
  currentLine = capture.value.replace(/\r/g,'');
  // Don't render immediately here (keyup also fires). Instead render once in RAF
  // with the correct caret position and set a flag so the subsequent keyup
  // handler skips one render to avoid flicker.
  requestAnimationFrame(()=>{
    const pos = capture.selectionStart;
    // ensure caret at end only when the browser already left the caret at the end.
    if (pos === capture.value.length) {
      capture.selectionStart = capture.selectionEnd = capture.value.length;
    }
    skipNextKeyupRender = true;
    renderLines(pos);
  });
});

capture.addEventListener('keydown',(e)=>{
  if(!running) return;
  // prevent arrow keys from moving selection to previous lines
  if(['ArrowUp','ArrowLeft','Home','PageUp'].includes(e.key)){
    // allow within current line only; if at pos 0, prevent
    if(capture.selectionStart === 0){ e.preventDefault(); }
  } 
  // prevent backspace deleting previous content
  if(e.key === 'Backspace'){
    if(capture.selectionStart === 0){
      // at start of current line, block deletion into bufferBefore
      e.preventDefault();
    }
  }
  // handle auto commits
  if(e.key === ' ' && currentLine.length >= MAX_LINE_CHARS){
    e.preventDefault();
    bufferBefore += currentLine+ ' \n';
    currentLine = '';
    capture.value = '';
    renderLines();
  }
  // Enter: commit current line and start a fresh one (we allow newline but do not require submit)
  if(e.key === 'Enter'){
    e.preventDefault();
    bufferBefore += currentLine + '\n';
    currentLine = '';
    capture.value = '';
    renderLines();
  }
});

function renderLines(cursorPos = currentLine.length) {
  if(!running) return;
  let allLines = [];
  if (bufferBefore)
    allLines = bufferBefore
      .split('\n')
      .filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
  
  allLines.push(currentLine);
  const tail = allLines.slice(-visibleLines);
  linesEl.innerHTML = '';

  tail.forEach((ln, idx) => {
    const div = document.createElement('div');
    div.className = 'line';
    // mark committed lines (all except the current editing line)
    // only justify if the line is long enough and contains at least one space
    if (idx !== tail.length - 1 && ln && ln.trim().length >= MIN_JUSTIFY_CHARS && ln.includes(' ')) {
      div.classList.add('committed');
    } else if (idx !== tail.length - 1) {
      div.classList.add('committedShort');
    }
    if (idx < Math.max(0, tail.length - 2)) div.classList.add('dim');

    if (idx === tail.length - 1) {
      div.classList.add('current');
      const beforeCursor = ln.slice(0, cursorPos);
      const afterCursor = ln.slice(cursorPos);

      // Build the DOM nodes directly (avoid innerHTML to reduce reflow/parsing and
      // to prevent restarting animations/transitions on sibling elements).
      if (beforeCursor) div.appendChild(document.createTextNode(beforeCursor));
      const cursorSpan = document.createElement('span');
      cursorSpan.id = 'cursor';
      div.appendChild(cursorSpan);
      // If there's no content after cursor, append a non-breaking space so the line keeps height
      div.appendChild(document.createTextNode(afterCursor || '\u00A0'));
    } else {
      div.textContent = ln || '\u00A0';
    }

    linesEl.appendChild(div);
  });
}


// Save: create a small JSON "locked" file that contains unlock_date and base64 content
function saveLockedFile(){
  const unlock = unlockDateInput.value;
  if(!unlock){
    alert('Please set an unlock date before saving.');
    return;
  }

  let full = (bufferBefore + currentLine)
    .replace(/ \n+/g, ' ')
    .replace(/\n+$/, '');
  full += '\n';

  const payload = {
    version: 1,
    title: title.value || 'Untitled',
    created: new Date().toISOString(),
    unlock_date: btoa(unescape(encodeURIComponent(unlock))),
    content_b64: btoa(unescape(encodeURIComponent(full)))
  };

  const safeTitle = payload.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const name = `${safeTitle}_${unlock.replace(/[:.]/g,'-')}.blind`;
  const url = URL.createObjectURL(blob);

  // Safari-safe method: create a temporary visible link and require user click
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';

  link.click();
}

saveBtn.addEventListener('click',saveLockedFile);

// Unlock: read a .blind file/folder, check unlock date, and if passed, decode and offer download
const unlockBtn = document.getElementById('unlockBtn');
const fileInput = document.getElementById('fileInput');

unlockBtn.onclick=()=>{ fileInput.value=''; fileInput.click(); };

fileInput.addEventListener('change', async (e)=>{
  const files=[...e.target.files];
  const today=new Date();
  const unlocked=[];

  for(const file of files){
    if(!file.name.endsWith('.blind')) continue;
    try{
      const payload=JSON.parse(await file.text());
      if(!payload.content_b64||!payload.unlock_date) continue;

      const unlockDate=new Date(decodeURIComponent(escape(atob(payload.unlock_date)))+'T00:00:00');
      if(today<unlockDate) continue;

      unlocked.push({
        title: payload.title || '',
        created: payload.created,
        content: decodeURIComponent(escape(atob(payload.content_b64))).trim()
      });
    }catch{}
  }

  if(!unlocked.length){
    alert('No unlocked texts found.');
    return;
  }

  // ordenar por fecha
  unlocked.sort((a,b)=>new Date(a.created)-new Date(b.created));

  const txt=buildLiteraryTxt(unlocked);
  downloadMergedTxt(txt);
});

/* ===============================
   FORMATO AMIGABLE
================================ */
function buildLiteraryTxt(texts){
  return texts.map(t=>{
    const date = t.created
      ? new Date(t.created).toLocaleDateString('en-GB',{
          day:'numeric', month:'long', year:'numeric'
        })
      : '';

    const title = t.title || 'Untitled';
    const underline = '─'.repeat(title.length);

    return `${title}
${underline}
${date ? '('+date+')' : ''}

${t.content}

\n\n— — —\n\n`;
  }).join('').trim();
}

function downloadMergedTxt(content){
  const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download='blindtype_unlocked.txt';
  link.click();
}


// ensure the invisible capture is focused on load
window.addEventListener('load',()=>{capture.focus();});