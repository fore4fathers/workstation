module.exports = {
  apps: [
    {
      name: 'workstation',
      script: 'server/src/start.js',
      cwd: '/var/www/workstation',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '4101',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      error_file: '/var/log/pm2/workstation-error.log',
      out_file: '/var/log/pm2/workstation-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
