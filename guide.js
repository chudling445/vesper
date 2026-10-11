const downloadLinks = document.querySelectorAll('[data-app-download]');
const downloadSections = document.querySelectorAll('[data-app-download-section]');

fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' })
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('Download status unavailable')))
  .then(({ downloadAvailable }) => {
    for (const link of downloadLinks) link.hidden = !downloadAvailable;
    for (const section of downloadSections) section.hidden = !downloadAvailable;
  })
  .catch(() => {
    for (const link of downloadLinks) link.hidden = true;
    for (const section of downloadSections) section.hidden = true;
  });
