module.exports = {
  apps: [
    {
      name: 'OLASUBOMI-MD',
      script: './main.js',
      instances: 1,
      // fork mode is correct for a WhatsApp bot. cluster mode is designed for
      // HTTP servers that share a port across multiple cores; using it here adds
      // a master/worker layer that interferes with socket state, alters stdin
      // handling, and can cause ghost reconnects during pairing.
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        BOT_NAME: 'OLASUBOMI-MD',
        BOT_VERSION: '3.0.0',
        BOT_PREFIX: '.',
        BOT_MODE: 'private'
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M',
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
