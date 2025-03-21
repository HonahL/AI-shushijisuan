// 移除 @netlify/kv 导入
// const { kv } = require('@netlify/kv');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 定义存储 API 密钥的本地文件路径
const API_KEY_FILE = path.join(__dirname, '../../.api-key.json');

// 读取 API 密钥的函数
const getApiKey = async () => {
  try {
    // 首先尝试从环境变量读取
    if (process.env.API_KEY) {
      return process.env.API_KEY;
    }
    
    // 如果环境变量中没有，尝试从本地文件读取
    if (fs.existsSync(API_KEY_FILE)) {
      const data = fs.readFileSync(API_KEY_FILE, 'utf8');
      const keyData = JSON.parse(data);
      return keyData.apiKey;
    }
    
    // 如果都没有找到，返回 null
    return null;
  } catch (error) {
    console.error('Error reading API key:', error);
    return null;
  }
};

// Netlify 函数处理程序
exports.handler = async (event, context) => {
  // 检查授权
  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: '未授权访问' }),
    };
  }
  
  const password = authHeader.split(' ')[1];
  if (password !== process.env.ADMIN_PASSWORD) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: '密码错误' }),
    };
  }
  
  // 获取 API 密钥
  const apiKey = await getApiKey();
  
  if (!apiKey) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'API 密钥未设置' }),
    };
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ apiKey }),
  };
};