var fs = require('fs');
var path = require('path');

// Load environment variables from skills/.env if exists (敏感配置不入公开仓库)
var envFile = path.join(process.env.HOME, 'skills', '.env');
if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(function(line) {
        line = line.trim();
        if (line && !line.startsWith('#') && line.indexOf('=') !== -1) {
            var idx = line.indexOf('=');
            var key = line.substring(0, idx).trim();
            var val = line.substring(idx + 1).trim();
            if (!process.env[key]) process.env[key] = val;
        }
    });
}

module.exports = {
  apps: [{
    name: 'hardware-reservation',
    script: 'server/src/index.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    }
  }]
};