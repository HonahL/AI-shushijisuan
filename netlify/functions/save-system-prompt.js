const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 定义存储系统提示词的本地文件路径
const SYSTEM_PROMPT_FILE = path.join(__dirname, '../../.system-prompt.json');

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
    const { systemPrompt } = JSON.parse(event.body);
    
    if (!systemPrompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '系统提示词不能为空' }),
      };
    }
    
    // 将系统提示词保存到本地文件
    fs.writeFileSync(SYSTEM_PROMPT_FILE, JSON.stringify({ 
      systemPrompt, 
      updatedAt: new Date().toISOString() 
    }));
    
    // 也可以选择性地更新环境变量（仅在当前进程中有效）
    process.env.SYSTEM_PROMPT_TEMPLATE = systemPrompt;
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: '系统提示词已更新' }),
    };
  } catch (error) {
    console.error('Error updating system prompt:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '更新系统提示词时出错' }),
    };
  }
}; 