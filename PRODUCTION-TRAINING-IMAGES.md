# Production training image rollout

The production migration loads 51 Civitai image records, including prompts and training metadata. The image files are stored on disk, not in PostgreSQL, so deploy the app code and `civitai_collector/data/images/` WebP files together.

## Rollout

1. Back up the production database and prepare the new app release.
2. Copy the updated app and `civitai_collector/data/images/*.webp` into the release. Keep the directory path intact and make the files readable by the app process.
3. From the project root, run the migration against the production database:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/src/sql/production-civitai-training.sql
   ```

   The script creates the `images` table and indexes if needed, then inserts or updates records by `civitai_id`. It can be rerun safely.

4. Start or restart the app using this release. The image route serves the local WebP files from `civitai_collector/data/images/`; the Civitai API key is not needed to load these already-downloaded images.

## Verify

Check that the expected records were applied:

```sql
SELECT COUNT(*)
FROM images
WHERE type = 'image'
  AND nsfw_level = 'None'
  AND NULLIF(BTRIM(prompt), '') IS NOT NULL
  AND downloaded = TRUE
  AND local_path LIKE 'civitai_collector/data/images/%.webp';
```

Expected result: `51`. Also check a sample image in the deployed app, for example `/api/civitai/images/144082237`, and confirm it returns an image rather than redirecting to Civitai.
