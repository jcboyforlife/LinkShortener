/* ==============================================
   LINK SHORTENER — script.js

   How this file is organised:
   1.  State object          — single source of truth
   2.  DOM references        — grab elements once, reuse everywhere
   3.  Validation helpers    — isEmpty, isValidURL
   4.  UI helpers            — showError, clearError, setLoading
   5.  Dark mode             — init + toggle
   6.  History               — load, save, render, clear
   7.  API call              — shortenURL (async/await + fetch)
   8.  Result display        — showResult
   9.  Copy to clipboard     — copyToClipboard
   10. Form submit handler   — handleSubmit
   11. Event listeners       — wire everything together
=============================================== */


/* ==============================================
   1. STATE OBJECT
   Instead of tracking what's visible/hidden by
   checking the DOM (e.g. "is the result card
   hidden?"), we keep ONE JavaScript object that
   represents the truth of the app at any moment.
   The DOM is just a reflection of this state.
   This pattern is the core idea behind React,
   Vue, etc. — we're learning it in vanilla JS.
=============================================== */
const state = {
  isLoading: false,      // true while API request is in flight
  lastOriginal: '',      // the URL the user typed
  lastShortened: '',     // the URL the API returned
  history: [],           // array of { original, shortened } objects
  isDarkMode: false,     // current theme
};


/* ==============================================
   2. DOM REFERENCES
   We call document.getElementById() ONCE per
   element and store the result in a variable.
   Calling it every time we need an element is
   wasteful — the browser has to search the whole
   DOM tree each time. Store once, reuse everywhere.
=============================================== */
const form          = document.getElementById('shorten-form');
const urlInput      = document.getElementById('url-input');
const errorMsg      = document.getElementById('error-message');
const loadingEl     = document.getElementById('loading-indicator');
const resultCard    = document.getElementById('result-card');
const originalUrlEl = document.getElementById('original-url');
const shortUrlEl    = document.getElementById('short-url');
const copyBtn       = document.getElementById('copy-btn');
const copyFeedback  = document.getElementById('copy-feedback');
const historyList   = document.getElementById('history-list');
const historyEmpty  = document.getElementById('history-empty');
const clearBtn      = document.getElementById('clear-history-btn');
const themeToggle   = document.getElementById('theme-toggle');


/* ==============================================
   3. VALIDATION HELPERS
   Small, focused functions that each do ONE thing.
   This is called the "single responsibility"
   principle — easier to read, test, and debug.
=============================================== */

/**
 * Returns true if the string is empty or only whitespace.
 * .trim() removes leading/trailing spaces before checking.
 */
function isEmpty(value) {
  return value.trim() === '';
}

/**
 * Returns true if the string looks like a valid URL.
 *
 * We use the built-in URL constructor as our validator.
 * If you pass it something that isn't a valid URL it
 * throws an error — we catch that error and return false.
 * This is more reliable than a regex because the URL spec
 * is complex and the browser's own parser handles edge cases.
 *
 * We also require the protocol to be http or https —
 * technically "ftp://..." is a valid URL but it won't
 * work with our shortening API.
 */
function isValidURL(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    // URL constructor threw — not a valid URL
    return false;
  }
}


/* ==============================================
   4. UI HELPERS
   Functions that update the DOM based on state.
   We centralise DOM mutations here so the rest
   of the code doesn't have to think about it.
=============================================== */

/**
 * Show an error message below the input field.
 * Also adds the red-border class to the input.
 */
function showError(message) {
  errorMsg.textContent = message;
  // .visible triggers the CSS max-height transition
  // that slides the error message into view
  errorMsg.classList.add('visible');
  urlInput.classList.add('input-error');

  // Tell screen readers to focus the error
  // (aria-live="polite" in the HTML means it will
  // be announced automatically, but setting focus
  // helps sighted keyboard users too)
  urlInput.setAttribute('aria-invalid', 'true');
}

/**
 * Remove any visible error state.
 */
function clearError() {
  errorMsg.textContent = '';
  errorMsg.classList.remove('visible');
  urlInput.classList.remove('input-error');
  urlInput.removeAttribute('aria-invalid');
}

/**
 * Show or hide the loading spinner.
 * Also disables the button while loading so the
 * user can't fire multiple API requests at once.
 *
 * @param {boolean} isLoading
 */
function setLoading(isLoading) {
  // Update state first — this is our source of truth
  state.isLoading = isLoading;

  // Toggle the spinner visibility
  // The `hidden` attribute is a native HTML boolean —
  // setting it to true removes the element from layout
  // and marks it aria-hidden for screen readers
  loadingEl.hidden = !isLoading;
  loadingEl.setAttribute('aria-hidden', String(!isLoading));

  // Disable the button during loading to prevent
  // double-submissions. The CSS :disabled style
  // makes it look visually dimmed automatically.
  const shortenBtn = document.getElementById('shorten-btn');
  shortenBtn.disabled = isLoading;

  // Also disable the input while loading
  urlInput.disabled = isLoading;
}

/**
 * Hide both the result card and the loading indicator.
 * Called when a new form submission starts, so we
 * start from a clean slate each time.
 */
function resetUI() {
  resultCard.hidden = true;
  loadingEl.hidden = true;
  copyFeedback.textContent = '';
  copyBtn.classList.remove('copied');
  copyBtn.textContent = 'Copy';
}


/* ==============================================
   5. DARK MODE
   We store the user's preference in localStorage
   under the key 'theme'. On page load we read it
   and apply it immediately — this prevents a
   "flash" where the page briefly shows the wrong
   theme before JS runs.
=============================================== */

/**
 * Apply a theme by toggling the 'dark' class on
 * <html> and updating the toggle button's icon.
 * Also persists the choice to localStorage.
 *
 * @param {boolean} dark — true = dark mode
 */
function applyTheme(dark) {
  state.isDarkMode = dark;

  if (dark) {
    document.documentElement.classList.add('dark');
    themeToggle.textContent = '☀️';
    themeToggle.setAttribute('aria-pressed', 'true');
    themeToggle.setAttribute('aria-label', 'Switch to light mode');
  } else {
    document.documentElement.classList.remove('dark');
    themeToggle.textContent = '🌙';
    themeToggle.setAttribute('aria-pressed', 'false');
    themeToggle.setAttribute('aria-label', 'Switch to dark mode');
  }

  // Save the preference so it persists after the page
  // is refreshed. localStorage stores key-value strings.
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}

/**
 * Read the saved theme from localStorage and apply it.
 * Called once when the page first loads.
 */
function initTheme() {
  // localStorage.getItem returns null if the key
  // doesn't exist (first-time visitor)
  const saved = localStorage.getItem('theme');

  if (saved === 'dark') {
    applyTheme(true);
  } else if (saved === 'light') {
    applyTheme(false);
  } else {
    // No saved preference — check if the OS/browser
    // itself is in dark mode using a media query
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark);
  }
}


/* ==============================================
   6. HISTORY (localStorage)
   We store history as a JSON string in localStorage.
   JSON.stringify() converts a JS array → string for
   storage. JSON.parse() converts it back → array
   when we read it out.
=============================================== */

/** Load history array from localStorage into state. */
function loadHistory() {
  const stored = localStorage.getItem('link-history');
  // If nothing is stored yet, fall back to an empty array
  state.history = stored ? JSON.parse(stored) : [];
}

/** Save the current state.history array to localStorage. */
function saveHistory() {
  // We only keep the 20 most recent entries to prevent
  // the list from growing indefinitely
  const trimmed = state.history.slice(0, 20);
  localStorage.setItem('link-history', JSON.stringify(trimmed));
}

/**
 * Re-render the history list in the DOM from state.history.
 * We always rebuild the list from scratch rather than
 * trying to insert/remove individual items — simpler and
 * less error-prone for a list this small.
 */
function renderHistory() {
  // Remove everything inside the <ul> first
  historyList.innerHTML = '';

  if (state.history.length === 0) {
    // Put the empty-state message back
    const emptyItem = document.createElement('li');
    emptyItem.id = 'history-empty';
    emptyItem.className = 'history-empty';
    emptyItem.textContent = 'No links shortened yet.';
    historyList.appendChild(emptyItem);
    return;
  }

  // Build one <li> per history entry.
  // We iterate newest-first by reversing a copy
  // (we don't mutate state.history directly)
  [...state.history].reverse().forEach(entry => {
    const li = document.createElement('li');
    li.className = 'history-item';

    // Original URL — truncated by CSS text-overflow: ellipsis
    const originalSpan = document.createElement('span');
    originalSpan.className = 'original';
    originalSpan.textContent = entry.original;
    originalSpan.title = entry.original; // full URL on hover tooltip

    // Shortened URL — a real clickable link
    const shortLink = document.createElement('a');
    shortLink.className = 'shortened';
    shortLink.href = entry.shortened;
    shortLink.textContent = entry.shortened;
    shortLink.target = '_blank';
    shortLink.rel = 'noopener noreferrer';

    li.appendChild(originalSpan);
    li.appendChild(shortLink);
    historyList.appendChild(li);
  });
}

/**
 * Add a new entry to history, save it, and re-render.
 *
 * @param {string} original  — the long URL
 * @param {string} shortened — the short URL
 */
function addToHistory(original, shortened) {
  // Avoid duplicate entries — if this exact original
  // URL is already in history, don't add it again
  const alreadyExists = state.history.some(
    entry => entry.original === original
  );
  if (alreadyExists) return;

  // Prepend to the front so newest is first
  state.history.unshift({ original, shortened });
  saveHistory();
  renderHistory();
}

/** Clear all history from state, storage, and DOM. */
function clearHistory() {
  state.history = [];
  localStorage.removeItem('link-history');
  renderHistory();
}


/* ==============================================
   7. API CALL — shortenURL
   This is the heart of the app. It makes a real
   HTTP request to the is.gd API and gets back a
   shortened URL.

   Key concepts introduced here:
   - async/await     — pausing execution until a
                       Promise resolves
   - fetch()         — the browser's built-in HTTP
                       client, returns a Promise
   - try/catch       — handling errors that might
                       be thrown during async work
   - Response.ok     — checking the HTTP status
                       (200 = success, 4xx/5xx = error)
=============================================== */

/**
 * Call the is.gd API to shorten a URL.
 * Returns the shortened URL string on success.
 * Throws an Error on failure.
 *
 * @param {string} originalUrl — the URL to shorten
 * @returns {Promise<string>}  — the shortened URL
 */
async function shortenURL(originalUrl) {
  // Build the API endpoint URL.
  // encodeURIComponent() makes the user's URL safe to
  // include as a query parameter by escaping characters
  // like &, =, /, ? that would break the URL structure.
  const apiURL = `https://is.gd/create.php?format=json&url=${encodeURIComponent(originalUrl)}`;

  // fetch() returns a Promise.
  // `await` pauses this function here until the
  // Promise resolves (i.e. the server responds),
  // then assigns the result to `response`.
  // This is much cleaner than nested .then() callbacks.
  const response = await fetch(apiURL);

  // `response` at this point is the HTTP response object.
  // It does NOT contain the body text yet — we need to
  // call .json() to read and parse the body.
  // .json() is also async, so we await it too.
  const data = await response.json();

  // is.gd returns either:
  //   { shorturl: "https://is.gd/abc123" }  → success
  //   { errorcode: 1, errormessage: "..." }  → failure
  if (data.errorcode) {
    // The API explicitly told us something went wrong
    throw new Error(data.errormessage || 'The link could not be shortened.');
  }

  if (!data.shorturl) {
    // The API responded but didn't give us a short URL
    // — unexpected format
    throw new Error('Unexpected response from the shortening service.');
  }

  // All good — return the shortened URL string
  return data.shorturl;
}


/* ==============================================
   8. RESULT DISPLAY
   After a successful API call, we populate the
   result card with the original and shortened URLs,
   then reveal it.
=============================================== */

/**
 * Populate and show the result card.
 *
 * @param {string} original  — the URL the user typed
 * @param {string} shortened — the URL from the API
 */
function showResult(original, shortened) {
  // Save to state
  state.lastOriginal  = original;
  state.lastShortened = shortened;

  // Populate the DOM elements
  originalUrlEl.textContent = original;

  // For the short URL we set both the visible text
  // AND the href so it's a real clickable link
  shortUrlEl.textContent = shortened;
  shortUrlEl.href = shortened;

  // Reset copy button in case it was already clicked
  copyBtn.classList.remove('copied');
  copyBtn.textContent = 'Copy';
  copyFeedback.textContent = '';

  // Reveal the result card by removing the `hidden` attribute
  resultCard.hidden = false;

  // Scroll the result card into view smoothly in case
  // the user is on a small screen and it's below the fold
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


/* ==============================================
   9. COPY TO CLIPBOARD
   The Clipboard API is modern and async.
   We await the write operation and handle the
   case where the user denies clipboard permission.
=============================================== */

/**
 * Copy the shortened URL to the user's clipboard.
 * Shows "Copied!" feedback on success, or an
 * error message if the browser blocked it.
 */
async function copyToClipboard() {
  try {
    // navigator.clipboard.writeText() returns a Promise.
    // We await it — if the user denied clipboard access,
    // it will throw and we'll catch it below.
    await navigator.clipboard.writeText(state.lastShortened);

    // Visual feedback — change the button style and text
    copyBtn.classList.add('copied');
    copyBtn.textContent = 'Copied!';
    copyFeedback.textContent = '✓ Link copied to clipboard';

    // Reset after 2.5 seconds so it's ready to copy again
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      copyBtn.textContent = 'Copy';
      copyFeedback.textContent = '';
    }, 2500);

  } catch {
    // Clipboard access was denied or not supported
    copyFeedback.textContent = 'Could not copy — please copy the link manually.';
  }
}


/* ==============================================
   10. FORM SUBMIT HANDLER
   This is the main coordinator function. When the
   user submits the form (button click OR Enter key),
   this function:
     1. Prevents the default page reload
     2. Validates the input
     3. Calls the API
     4. Shows the result or an error
=============================================== */

/**
 * Handle the form's submit event.
 * async because it needs to await the API call.
 *
 * @param {Event} event — the browser submit event
 */
async function handleSubmit(event) {
  // Prevent the form from doing its default behaviour
  // (submitting to a server and reloading the page).
  // We're handling everything ourselves with JavaScript.
  event.preventDefault();

  // Don't allow a second submission while one is in progress
  if (state.isLoading) return;

  // Read and clean the input value
  const rawInput = urlInput.value.trim();

  // --- Validation ---
  clearError();  // always clear any previous error first

  if (isEmpty(rawInput)) {
    showError('Please enter a URL before shortening.');
    urlInput.focus(); // send the cursor back to the input
    return;           // stop here — don't call the API
  }

  if (!isValidURL(rawInput)) {
    showError('Please enter a valid URL including https:// — e.g. https://example.com');
    urlInput.focus();
    return;
  }

  // --- Start loading ---
  resetUI();        // hide any previous result or spinner
  setLoading(true); // show spinner, disable button

  try {
    // Await the API call — execution pauses here until
    // the API responds (or throws an error)
    const shortened = await shortenURL(rawInput);

    // --- Success ---
    showResult(rawInput, shortened);
    addToHistory(rawInput, shortened);

    // Clear the input so it's ready for the next URL
    urlInput.value = '';

  } catch (error) {
    // Something went wrong — either a network error
    // (fetch itself threw) or an API error (we threw
    // inside shortenURL). Either way, show the message.
    showError(error.message || 'Something went wrong. Please try again.');

  } finally {
    // `finally` runs whether we succeeded or failed —
    // always stop the loading state so the UI isn't
    // stuck in a spinner forever
    setLoading(false);
  }
}


/* ==============================================
   11. EVENT LISTENERS
   We wire up all interactivity here at the bottom,
   after all the functions are defined.
   Each listener says: "when X happens, call Y".
=============================================== */

// Form submit — covers BOTH the button click AND
// pressing Enter in the input field (because the
// browser fires 'submit' on the <form> for both)
form.addEventListener('submit', handleSubmit);

// Copy button click
copyBtn.addEventListener('click', copyToClipboard);

// Clear history button click
clearBtn.addEventListener('click', clearHistory);

// Dark/light mode toggle click
themeToggle.addEventListener('click', () => {
  // Flip the current theme to its opposite
  applyTheme(!state.isDarkMode);
});

// Clear the red error state on the input as soon
// as the user starts typing again — gives immediate
// feedback that their correction is being recognised
urlInput.addEventListener('input', () => {
  if (urlInput.classList.contains('input-error')) {
    clearError();
  }
});


/* ==============================================
   INITIALISE
   Everything here runs once when the page loads.
   Order matters:
   1. Apply the theme first (prevents flash)
   2. Load history from localStorage
   3. Render the history list
=============================================== */
initTheme();
loadHistory();
renderHistory();