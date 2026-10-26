// PM2 process file for the Express API + built SPA.
// Usage (from the repo root on the server):
//   pm2 start deploy/ecosystem.config.cjs --env production
//   pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'adhyatmik-api',
      cwd: __dirname + '/..',
      script: 'server/index.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      // Optional extra Node workers — leave 1 unless the DB pool is sized for it.
      env_production: {
        NODE_ENV: 'production',
        WEB_CONCURRENCY: '1',
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 3000,
      // server/index.js drains connections for up to 15s on SIGTERM.
      kill_timeout: 20000,
      max_memory_restart: '512M',
      out_file: 'logs/api-out.log',
      error_file: 'logs/api-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
