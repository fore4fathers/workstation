# Arabic translation setup

The English catalog lives in `web/src/locales/en.json`. Add user-facing strings there using stable keys. The language provider uses `web/src/locales/ar.json` when Arabic is selected and falls back to English for any missing entry.

To generate Arabic entries, set `DEEPL_AUTH_KEY` in the root `.env` file and run:

```sh
npm run translate:ar
```

The script sends catalog values to DeepL in batches and writes translations to `web/src/locales/ar.json`. Existing Arabic entries are preserved; pass `--overwrite` to regenerate them. Keys ending in `:fx` use DeepL API Free (`api-free.deepl.com`); other keys use the Pro endpoint (`api.deepl.com`).

The key must stay in the ignored root `.env` file or in the process environment. Do not put it in frontend code or a committed file.
