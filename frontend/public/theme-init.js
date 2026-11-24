// Apply the saved theme before first paint to avoid a flash. Kept as a file (not inline)
// so the Content-Security-Policy can forbid inline scripts.
try {
  var t = localStorage.getItem('gm-theme')
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t
} catch (e) { /* storage blocked */ }
