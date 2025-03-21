// 移除 @netlify/kv 导入
// const { kv } = require('@netlify/kv');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 定义存储 API 密钥的本地文件路径
const API_KEY_FILE = path.join(__dirname, '../../.api-key.json');

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
  
  // 检查请求方法和内容
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: '方法不允许' }),
    };
  }
  
  try {
    const { apiKey } = JSON.parse(event.body);
    
    if (!apiKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'API 密钥不能为空' }),
      };
    }
    
    // 将 API 密钥保存到本地文件
    fs.writeFileSync(API_KEY_FILE, JSON.stringify({ apiKey, updatedAt: new Date().toISOString() }));
    
    // 也可以选择性地更新环境变量（仅在当前进程中有效）
    process.env.API_KEY = apiKey;
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'API 密钥已更新' }),
    };
  } catch (error) {
    console.error('Error updating API key:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '更新 API 密钥时出错' }),
    };
  }
};