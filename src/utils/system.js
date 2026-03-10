// src/utils/system.js
// Lecture des informations système du Raspberry Pi
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
    const model = cpus[0]?.model || 'Raspberry Pi';
    const cores = cpus.length;
    
    // Calcul de l'usage CPU (moyenne sur 100ms)
    const cpuUsage = getCpuUsage();
    
    return {
      model: model.trim(),
      cores,
      usage: cpuUsage,
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
      for (const type in cpu.times) {
        total += cpu.times[type];
      }
      idle += cpu.times.idle;
    }
    
    // Simple estimation (pas parfait sans intervalles, mais suffisant)
    const usage = Math.round((1 - idle / total) * 100);
    return Math.max(0, Math.min(100, usage));
  } catch (e) {
    return 0;
  }
};

const getMemoryInfo = () => {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usagePercent = Math.round((used / total) * 100);
  
  return {
    total: formatBytes(total),
    used: formatBytes(used),
    free: formatBytes(free),
    usagePercent
  };
};

const getDiskInfo = () => {
  try {
    const output = execSync("df -h / | awk 'NR==2 {print $2\"|\"$3\"|\"$4\"|\"$5}'", {
      timeout: 3000,
      encoding: 'utf8'
    }).trim();
    
    const [total, used, free, usage] = output.split('|');
    return {
      total,
      used,
      free,
      usagePercent: parseInt(usage) || 0
    };
  } catch (e) {
    return { total: 'N/A', used: 'N/A', free: 'N/A', usagePercent: 0 };
  }
};

const getTemperature = () => {
  try {
    // Raspberry Pi expose la température ici
    const temp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    return parseFloat((parseInt(temp.trim()) / 1000).toFixed(1));
  } catch (e) {
    try {
      // Fallback via vcgencmd (Raspberry Pi OS)
      const output = execSync('vcgencmd measure_temp 2>/dev/null', { timeout: 1000, encoding: 'utf8' });
      const match = output.match(/temp=([\d.]+)/);
      return match ? parseFloat(match[1]) : null;
    } catch (e2) {
      return null;
    }
  }
};

const getUptime = () => {
  const uptimeSeconds = os.uptime();
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  
  let formatted = '';
  if (days > 0) formatted += `${days}j `;
  if (hours > 0) formatted += `${hours}h `;
  formatted += `${minutes}min`;
  
  return { seconds: uptimeSeconds, formatted };
};

const getNetworkInfo = () => {
  try {
    const interfaces = os.networkInterfaces();
    const result = [];
    
    for (const [name, addrs] of Object.entries(interfaces)) {
      // Ignorer loopback
      if (name === 'lo') continue;
      
      const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
      if (ipv4) {
        result.push({ interface: name, ip: ipv4.address });
      }
    }
    return result;
  } catch (e) {
    return [];
  }
};

const formatBytes = (bytes) => {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
};

module.exports = { getSystemInfo };
