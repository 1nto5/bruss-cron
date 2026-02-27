module.exports = {
  apps: [
    {
      name: 'bruss-cron',
      script: './index.js',
      interpreter: 'node',
      max_memory_restart: '2G',
      kill_timeout: 5000,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 5000,
      instances: 1,
      exec_mode: 'fork',
      error_file: 'C:\\ProgramData\\pm2\\home\\logs\\bruss-cron-error.log',
      out_file: 'C:\\ProgramData\\pm2\\home\\logs\\bruss-cron-out.log',
    },
  ],
};
