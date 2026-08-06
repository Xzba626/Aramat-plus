/**
 * PM2 process file for Aramat Plus (Next.js production).
 *
 * Usage:
 *   npm run build
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup   # once, follow printed command
 */
module.exports = {
  apps: [
    {
      name: "aramat-plus",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Load secrets from .env in project root (PM2 does not auto-load .env).
      // Prefer: `pm2 start ecosystem.config.js --update-env` after exporting env,
      // or use dotenv-cli / systemd EnvironmentFile.
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
