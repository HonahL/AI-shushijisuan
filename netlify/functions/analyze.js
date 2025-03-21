const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

// 定义存储系统提示词的本地文件路径
const SYSTEM_PROMPT_FILE = path.join(__dirname, '../../.system-prompt.json');

// 读取系统提示词的函数
const getSystemPrompt = async () => {
  try {
    // 首先尝试从环境变量读取
    if (process.env.SYSTEM_PROMPT_TEMPLATE) {
      return process.env.SYSTEM_PROMPT_TEMPLATE;
    }
    
    // 如果环境变量中没有，尝试从本地文件读取
    if (fs.existsSync(SYSTEM_PROMPT_FILE)) {
      const data = fs.readFileSync(SYSTEM_PROMPT_FILE, 'utf8');
      const promptData = JSON.parse(data);
      return promptData.systemPrompt;
    }
    
    // 如果都没有找到，返回默认提示词
    return `小学生竖式计算错误，哪个环节出现问题？**How you think:你按照竖式计算步骤，首先从个位开始，然后十位计算验证，逐位比对学生的口算结果与正确答案的区别；其次加入考虑学生的粗心因素；最后综合辅助位信息，简短思考出错环节和原因（不超过1000字）**你的输出:1 明确告知用户哪个环节出现错误 2 指出可能的原因 3 根据错因，再出三道同类型的题。`;
  } catch (error) {
    console.error('Error reading system prompt:', error);
    return `小学生竖式计算错误，哪个环节出现问题？**How you think:你按照竖式计算步骤，首先从个位开始，然后十位计算验证，逐位比对学生的口算结果与正确答案的区别；其次加入考虑学生的粗心因素；最后综合辅助位信息，简短思考出错环节和原因（不超过1000字）**你的输出:1 明确告知用户哪个环节出现错误 2 指出可能的原因 3 根据错因，再出三道同类型的题。`;
  }
};

// 读取 API 密钥的函数
const getApiKey = async () => {
  try {
    // 首先尝试从环境变量读取
    if (process.env.DEEPSEEK_API_KEY) {
      return process.env.DEEPSEEK_API_KEY;
    }
    
    // 如果环境变量中没有，尝试从本地文件读取
    const API_KEY_FILE = path.join(__dirname, '../../.api-key.json');
    if (fs.existsSync(API_KEY_FILE)) {
      const data = fs.readFileSync(API_KEY_FILE, 'utf8');
      const keyData = JSON.parse(data);
      return keyData.apiKey;
    }
    
    // 如果都没有找到，返回默认 API 密钥
    return 'sk-3cf38d5043e0441f8442e443cf361878'; // 默认 API 密钥
  } catch (error) {
    console.error('Error reading API key:', error);
    return 'sk-3cf38d5043e0441f8442e443cf361878'; // 默认 API 密钥
  }
};

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: '方法不允许' }),
    };
  }

  try {
    const { num1, num2, type, userAnswer, correctAnswer, auxiliaryDigits } = JSON.parse(event.body);
    
    // 获取系统提示词
    let systemPrompt = await getSystemPrompt();
    
    // 获取特定运算类型的提示词
    let operationPrompt = '';
    if (type === 'addition') {
      operationPrompt = process.env.ADDITION_PROMPT || '请分析这道加法题的错误原因。';
    } else if (type === 'subtraction') {
      operationPrompt = process.env.SUBTRACTION_PROMPT || '请分析这道减法题的错误原因。';
    } else if (type === 'multiplication') {
      operationPrompt = process.env.MULTIPLICATION_PROMPT || '请分析这道乘法题的错误原因，特别关注乘法竖式的计算步骤。';
    }
    
    // 构建提示词
    const problemData = { num1, num2, type, userAnswer, correctAnswer, auxiliaryDigits };
    
    // 替换模板变量
    let prompt = systemPrompt.replace(/\${problemData\.num1}/g, num1)
                            .replace(/\${problemData\.num2}/g, num2)
                            .replace(/\${problemData\.type === 'addition' \? '\+' : problemData\.type === 'subtraction' \? '-' : '×'}/g, 
                                    type === 'addition' ? '+' : type === 'subtraction' ? '-' : '×')
                            .replace(/\${problemData\.correctAnswer}/g, correctAnswer)
                            .replace(/\${problemData\.userAnswer}/g, userAnswer);
    
    // 添加特定运算类型的提示词
    prompt = operationPrompt + '\n\n' + prompt;
    
    // 如果有辅助位信息，添加到提示词中
    if (auxiliaryDigits && auxiliaryDigits.length > 0) {
      prompt += '\n\n辅助位信息: ' + JSON.stringify(auxiliaryDigits);
    }
    
    // 获取 API 密钥
    const apiKey = await getApiKey();
    
    // 调用 DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一位小学数学老师，擅长分析学生在竖式计算中的错误。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('DeepSeek API 错误:', data.error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.error.message || '调用 AI 服务时出错' })
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        analysis: data.choices[0].message.content,
        prompt: prompt
      })
    };
  } catch (error) {
    console.error('分析错误:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 