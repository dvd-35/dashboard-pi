// src/middleware/logger.js
const fs = require('fs');
const path = require('path');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logToFile = (type, message) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${type}] ${message}\n`;
  const logFile = path.join(logsDir, `security-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFile(logFile, line, (err) => {
    if (err) console.error('Erreur écriture log:', err);
  });
};

const securityLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = `${req.ip} "${req.method} ${req.path}" ${res.statusCode} ${duration}ms`;

    if (res.statusCode >= 400) {
      logToFile(res.statusCode >= 500 ? 'ERROR' : 'WARN', log);
    }

    if (req.path === '/login' && req.method === 'POST') {
      const status = res.statusCode === 302 ? 'SUCCESS' : 'FAILED';
      logToFile(`AUTH_${status}`, `${req.ip} tentative login`);
    }

    if (process.env.NODE_ENV === 'development') {
      const color = res.statusCode >= 500 ? '\x1b[31m' : res.statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
      console.log(`${color}${log}\x1b[0m`);
    }
  });

  next();
};

const logSecurity = (event, details) => {
  logToFile('SECURITY', `${event}: ${JSON.stringify(details)}`);
};

module.exports = { securityLogger, logSecurity };
