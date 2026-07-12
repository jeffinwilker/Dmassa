/**
 * PM2 - config para VPS.
 *
 * Uso:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save                       # persiste entre reboots
 *   pm2 startup                    # gera comando pra habilitar no boot
 *   pm2 logs dmassa-web
 *   pm2 reload dmassa-web          # reload sem downtime
 */

module.exports = {
  apps: [
    {
      name: "dmassa-web",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: process.env.APP_PORT || 3000,
        HOSTNAME: "127.0.0.1",
      },
      // Reinicia se travar / vazar memoria
      max_memory_restart: "500M",
      // Aguarda o Next boot completo antes de considerar "online"
      wait_ready: false,
      listen_timeout: 10000,
      // Logs
      out_file: "./logs/web-out.log",
      error_file: "./logs/web-err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "dmassa-worker",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/workers/index.ts",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      env: {
        NODE_ENV: "production",
        NODE_PATH: "./node_modules",
        TSX_TSCONFIG_PATH: "./tsconfig.json",
        WORKER_CONCURRENCY: process.env.WORKER_CONCURRENCY || "5",
      },
      max_memory_restart: "500M",
      out_file: "./logs/worker-out.log",
      error_file: "./logs/worker-err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
