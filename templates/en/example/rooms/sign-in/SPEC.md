# sign-in — spec

Only what the artifact cannot show.

- **Where it is used:** desktop and tablet browsers; keyboard and touch; works offline
  (nothing on this screen fetches until submit)
- **States:**
  - default — `index.html`
  - rejected credentials — `index-error.html` (same layout, one alert above the button)
- **Constraints:**
  - one purpose per screen: sign in, nothing else
  - the submit button is reachable without scrolling at 1024×768
  - errors are stated in one sentence, without blame
- **Uses:** `components/field`, `components/button-primary`, tokens `--surface`, `--primary`
