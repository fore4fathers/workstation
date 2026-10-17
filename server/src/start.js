import { createHttpServer } from './index.js';
import { config } from './config.js';
import { migrate } from './sql/migrate.js';

migrate()
  .then(() => {
    const server = createHttpServer();
    server.listen(config.port, '127.0.0.1', () => {
      console.log(`ai-workstation on http://127.0.0.1:${config.port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
