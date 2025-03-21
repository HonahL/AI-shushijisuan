const fs = require('fs');
const path = require('path');

// 本地存储路径
const LOCAL_CONFIG_PATH = path.join(__dirname, '../../../.local-config.json');

// 检查是否在本地环境
function isLocalEnvironment() {
  return process.env.NODE_ENV === 'development' || 
         !process.env.NETLIFY || 
         process.env.NETLIFY_LOCAL === 'true';
}

// 本地存储函数
async function localSet(key, value) {
  let config = {};
  try {
    if (fs.existsSync(LOCAL_CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('读取本地配置失败:', err);
  }
  
  config[key] = value;
  fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(config, null, 2));
  return true;
}

async function localGet(key) {
  try {
    if (fs.existsSync(LOCAL_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8'));
      return config[key];
    }
  } catch (err) {
    console.error('读取本地配置失败:', err);
  }
  return null;
}

module.exports = {
  isLocalEnvironment,
  localSet,
  localGet
}; 