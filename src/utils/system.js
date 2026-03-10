// src/utils/system.js
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const getSystemInfo = async () => {
  return {
    cpu: getCpuInfo(),
    memory: getMemoryInfo(),
    disk: getDiskInfo(),
    temperature: getTemperature(),
    uptime: getUptime(),
    network: getNetworkInfo(),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
};

const getCpuInfo = () => {
  try {
    const cpus = os.cpus();
    return {
      model: (cpus[0]?.model || 'Raspberry Pi').trim(),
      cores: cpus.length,
      usage: getCpuUsage(),
      loadAvg: os.loadavg().map(v => parseFloat(v.toFixed(2)))
    };
  } catch (e) {
    return { model: 'N/A', cores: 0, usage: 0, loadAvg: [0, 0, 0] };
  }
};

const getCpuUsage = () => {
  try {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) total += cpu.times[type];
      idle += cpu.times.idle;
    }
    return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
  } catch (e) {
    return 0;
  }
};

const getMemoryInfo = () => {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    total: formatBytes(total),
    used: formatBytes(used),
    free: formatBytes(free),
    usagePercent: Math.round((used / total) * 100)
  };
};

const getDiskInfo = () => {
  try {
    const output = execSync("df -h / | awk 'NR==2 {print $2\"|\"$3\"|\"$4\"|\"$5}'", {
      timeout: 3000,
      encoding: 'utf8'
    }).trim();
    const [total, used, free, usage] = output.split('|');
    return { total, used, free, usagePercent: parseInt(usage) || 0 };
  } catch (e) {
    return { total: 'N/A', used: 'N/A', free: 'N/A', usagePercent: 0 };
  }
};

const getTemperature = () => {
  try {
    const temp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    return parseFloat((parseInt(temp.trim()) / 1000).toFixed(1));
  } catch (e) {
    try {
      const output = execSync('vcgencmd measure_temp 2>/dev/null', { timeout: 1000, encoding: 'utf8' });
      const match = output.match(/temp=([\d.]+)/);
      return match ? parseFloat(match[1]) : null;
    } catch (e2) {
      return null;
    }
  }
};

const getUptime = () => {
  const s = os.uptime();
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  let formatted = '';
  if (days > 0) formatted += `${days}j `;
  if (hours > 0) formatted += `${hours}h `;
  formatted += `${minutes}min`;
  return { seconds: s, formatted };
};

const getNetworkInfo = () => {
  try {
    const interfaces = os.networkInterfaces();
    const result = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (name === 'lo') continue;
      const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
      if (ipv4) result.push({ interface: name, ip: ipv4.address });
    }
    return result;
  } catch (e) {
    return [];
  }
};

const formatBytes = (bytes) => {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
};

module.exports = { getSystemInfo };
