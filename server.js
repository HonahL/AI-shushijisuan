require('dotenv').config();
console.log('ADMIN_PASSWORD环境变量:', process.env.ADMIN_PASSWORD);

const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const apiRoutes = require('./api');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 设置环境标识
process.env.NODE_ENV = 'development';
process.env.NETLIFY_LOCAL = 'true';

const app = express();
app.use(cors());
app.use(express.json({
  strict: false,
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      console.error('JSON 解析错误:', e);
    }
    req.rawBody = buf.toString();
  }
}));

// 添加 URL 编码解析器
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static('public'));
app.use(express.static('竖式计算'));

// 主页路由 - 使用 html12 作为主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '竖式计算/html12'));
});

// API路由
app.use('/api', apiRoutes);

// 导入 Netlify 函数
const updateApiKey = require('./netlify/functions/update-api-key').handler;
const getApiKey = require('./netlify/functions/get-api-key').handler;
const analyze = require('./netlify/functions/analyze').handler;
const saveSystemPrompt = require('./netlify/functions/save-system-prompt').handler;

// API 路由
app.post('/api/update-api-key', async (req, res) => {
  const result = await updateApiKey({
    httpMethod: 'POST',
    body: JSON.stringify(req.body)
  });
  
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.get('/api/get-api-key', async (req, res) => {
  const result = await getApiKey({
    httpMethod: 'GET'
  });
  
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { prompt, problemData } = req.body;
    
    // 设置响应头以支持流式输出
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 确保使用正确的 API 密钥
    let DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
    
    // 从环境变量获取系统提示词模板，如果不存在则使用默认值
    let systemPromptTemplate = process.env.SYSTEM_PROMPT_TEMPLATE || 
    `小学生竖式计算错误，哪个环节出现问题？**How you think:你按照竖式计算步骤，首先从个位开始，然后十位计算验证，逐位比对学生的口算结果与正确答案的区别；其次加入考虑学生的粗心因素；最后综合辅助位信息，简短思考出错环节和原因（不超过1000字）**你的输出:1 明确告知用户哪个环节出现错误 2 指出可能的原因 3 根据错因，再出三道同类型的题。`;
    
    // 构建题目数据部分
    const problemDataText = `
    - 题目：${problemData.num1} ${problemData.type === 'addition' ? '+' : problemData.type === 'subtraction' ? '-' : '×'} ${problemData.num2}
    - 正确答案：${problemData.correctAnswer}
    - 学生答案：${problemData.userAnswer}
    `;
    
    // 组合系统提示词和题目数据
    let fullSystemPrompt = `${systemPromptTemplate}\n\n${problemDataText}`;
    
    // 获取用户提示词（前端传入的prompt已经包含了用户设置的运算提示词）
    // 确保使用最新的用户提示词
    let userPrompt = prompt;
    
    console.log('------- 系统提示词开始 -------');
    console.log(fullSystemPrompt);
    console.log('------- 系统提示词结束 -------');
    
    console.log('------- 用户提示词开始 -------');
    console.log(userPrompt);
    console.log('------- 用户提示词结束 -------');
    
    // 检查用户提示词是否已包含进位信息
    if (!userPrompt.includes('进位情况') && !userPrompt.includes('借位情况') && problemData.carriesInfo) {
        // 只有当用户提示词中不包含进位/借位信息时，才添加
        const carriesPrefix = `我的${problemData.type === 'addition' ? '进位' : problemData.type === 'subtraction' ? '借位' : '进位'}情况: `;
        userPrompt += `\n${carriesPrefix}${problemData.carriesInfo}`;
    }
    
    // 在发送API请求前，先向前端发送调试信息
    res.write(`data: ${JSON.stringify({ 
        type: 'system_prompt_template', 
        content: systemPromptTemplate,
        isDebug: true  // 添加调试标志
    })}\n\n`);

    res.write(`data: ${JSON.stringify({ 
        type: 'problem_data', 
        content: problemDataText,
        isDebug: true  // 添加调试标志
    })}\n\n`);

    res.write(`data: ${JSON.stringify({ 
        type: 'full_system_prompt', 
        content: fullSystemPrompt,
        isDebug: true  // 添加调试标志
    })}\n\n`);
    
    res.write(`data: ${JSON.stringify({ 
        type: 'user_prompt', 
        content: userPrompt,
        isDebug: true  // 添加调试标志
    })}\n\n`);
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    };
    
    const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            model: "deepseek-reasoner",  // 使用 DeepSeek-R1 推理模型
            messages: [
                {
                    role: "system", 
                    content: fullSystemPrompt  // 使用组合后的完整系统提示词
                },
                {
                    role: "user",
                    content: userPrompt  // 使用前端传入的用户提示词
                }
            ],
            stream: true,  // 启用流式输出
            temperature: 0.1,  // 使用官方推荐的温度值
        })
    });
    
    // 检查响应状态
    if (!response.ok) {
        const errorData = await response.json();
        console.error('DeepSeek API错误:', errorData);
        throw new Error(errorData.error?.message || 'API请求失败');
    }
    
    console.log('DeepSeek API连接成功，开始接收流式响应');
    
    // 设置超时，防止无限循环
    const timeout = setTimeout(() => {
        console.log('等待响应超过300秒，强制结束');
        res.write('data: {"error": "响应超时"}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
    }, 300000); // 300秒超时
    
    // 使用 Node.js 流处理方式
    response.body.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.substring(6);
                if (data === '[DONE]') {
                    res.write('data: [DONE]\n\n');
                    // 收到 [DONE] 信号，主动结束响应
                    console.log('收到 [DONE] 信号，结束响应');
                    clearTimeout(timeout);
                    res.end();
                    return;
                } else {
                    try {
                        const parsedData = JSON.parse(data);
                        
                        // 检查是否有思维链内容或最终答案
                        if (parsedData.choices && parsedData.choices[0]?.delta) {
                            const delta = parsedData.choices[0].delta;
                            let content = '';
                            let contentType = '';
                            
                            // 处理思维链内容
                            if (delta.reasoning_content) {
                                content = delta.reasoning_content;
                                contentType = 'thinking';
                                console.log('收到思维链内容:', content.substring(0, 30) + (content.length > 30 ? '...' : ''));
                            }
                            // 处理最终答案
                            else if (delta.content) {
                                content = delta.content;
                                contentType = 'content';
                                console.log('收到最终答案:', content.substring(0, 30) + (content.length > 30 ? '...' : ''));
                            }
                            
                            // 如果有内容，则处理
                            if (content) {
                                // 发送内容到前端，指定类型
                                res.write(`data: ${JSON.stringify({ type: contentType, content })}\n\n`);
                            }
                        }
                        
                        // 检查是否有结束原因
                        if (parsedData.choices && parsedData.choices[0]?.finish_reason) {
                            console.log('检测到结束原因:', parsedData.choices[0].finish_reason);
                            res.write('data: [DONE]\n\n');
                            clearTimeout(timeout);
                            res.end();
                            return;
                        }
                    } catch (e) {
                        console.error('解析数据失败:', e, '原始数据:', data);
                    }
                }
            }
        }
    });
    
    // 处理流结束
    response.body.on('end', () => {
        console.log('流式响应结束');
        clearTimeout(timeout);
        // 确保响应已经结束
        res.end();
    });
    
    // 处理错误
    response.body.on('error', (err) => {
        console.error('流处理错误:', err);
        clearTimeout(timeout);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
    });
  } catch (error) {
    console.error('API错误:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

app.post('/api/save-system-prompt', (req, res) => {
    try {
        const { systemPrompt, adminPassword } = req.body;
        
        console.log('收到保存系统提示词请求:');
        console.log('系统提示词长度:', systemPrompt?.length || 0);
        
        // 验证请求数据
        if (!systemPrompt) {
            return res.status(400).json({ error: '系统提示词不能为空' });
        }
        
        // 简单的管理密码验证
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
        if (adminPassword !== ADMIN_PASSWORD) {
            console.log('密码验证失败');
            return res.status(401).json({ error: '管理密码不正确' });
        }
        
        console.log('旧系统提示词:', process.env.SYSTEM_PROMPT_TEMPLATE ? 
            process.env.SYSTEM_PROMPT_TEMPLATE.substring(0, 30) + '...' : '未设置');
        
        // 保存系统提示词到环境变量
        process.env.SYSTEM_PROMPT_TEMPLATE = systemPrompt;
        
        console.log('更新后的系统提示词:', systemPrompt.substring(0, 30) + '...');
        
        // 保存到配置文件
        const fs = require('fs');
        const path = require('path');
        
        // 确保使用绝对路径
        const envPath = path.resolve(__dirname, '.env');
        console.log('尝试写入 .env 文件路径:', envPath);
        
        let envContent = '';
        
        try {
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
                console.log('读取现有 .env 文件成功');
                
                // 检查文件是否可写
                try {
                    fs.accessSync(envPath, fs.constants.W_OK);
                    console.log('.env 文件可写');
                } catch (accessError) {
                    console.error('.env 文件不可写:', accessError);
                    // 如果文件不可写，则只更新环境变量，不尝试写入文件
                    return res.json({ 
                        success: true, 
                        message: '系统提示词已更新(仅内存)',
                        warning: '无法写入配置文件，更改仅在服务器重启前有效',
                        systemPrompt: process.env.SYSTEM_PROMPT_TEMPLATE
                    });
                }
                
                // 替换或添加 SYSTEM_PROMPT_TEMPLATE
                if (envContent.includes('SYSTEM_PROMPT_TEMPLATE=')) {
                    envContent = envContent.replace(
                        /SYSTEM_PROMPT_TEMPLATE=.*/,
                        `SYSTEM_PROMPT_TEMPLATE="${systemPrompt.replace(/"/g, '\\"')}"`
                    );
                } else {
                    envContent += `\nSYSTEM_PROMPT_TEMPLATE="${systemPrompt.replace(/"/g, '\\"')}"\n`;
                }
            } else {
                console.log('.env 文件不存在，将创建新文件');
                envContent = `SYSTEM_PROMPT_TEMPLATE="${systemPrompt.replace(/"/g, '\\"')}"\n`;
            }
            
            fs.writeFileSync(envPath, envContent);
            console.log('.env 文件写入成功');
            
            // 重新加载环境变量
            require('dotenv').config();
            console.log('环境变量已重新加载');
        } catch (error) {
            console.error('写入 .env 文件错误:', error);
            // 返回部分成功的响应
            return res.json({ 
                success: true, 
                message: '系统提示词已更新(仅内存)',
                warning: '无法写入配置文件，更改仅在服务器重启前有效: ' + error.message,
                systemPrompt: process.env.SYSTEM_PROMPT_TEMPLATE
            });
        }
        
        console.log('系统提示词已更新');
        return res.json({ 
            success: true, 
            message: '系统提示词已更新',
            systemPrompt: process.env.SYSTEM_PROMPT_TEMPLATE
        });
    } catch (error) {
        console.error('保存系统提示词错误:', error);
        return res.status(500).json({ error: error.message || '未知错误' });
    }
});

// 获取系统提示词
app.get('/api/get-system-prompt', (req, res) => {
    let systemPrompt = process.env.SYSTEM_PROMPT_TEMPLATE || 
    `小学生竖式计算错误，哪个环节出现问题？**How you think:你按照竖式计算步骤，首先从个位开始，然后十位计算验证，逐位比对学生的口算结果与正确答案的区别；其次加入考虑学生的粗心因素；最后综合辅助位信息，简短思考出错环节和原因（不超过1000字）**你的输出:1 明确告知用户哪个环节出现错误 2 指出可能的原因 3 根据错因，再出三道同类型的题。`;
    
    res.json({ systemPrompt });
});

// 更新 API 密钥
app.post('/api/update-api-key', async (req, res) => {
    try {
        const { adminPassword, apiKey } = req.body;
        
        console.log('收到更新API密钥请求:');
        console.log('API密钥原始内容:', apiKey);
        console.log('API密钥长度:', apiKey.length);
        console.log('API密钥字符类型:', apiKey.split('').map(char => {
            if (/[a-zA-Z]/.test(char)) return 'letter';
            if (/[0-9]/.test(char)) return 'number';
            if (/[-_]/.test(char)) return 'special';
            return 'other';
        }).join(', '));
        
        // 验证管理员密码
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
        if (adminPassword !== ADMIN_PASSWORD) {
            console.log('密码验证失败');
            return res.status(401).json({ error: '密码不正确' });
        }
        
        console.log('旧API密钥:', process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.substring(0, 5) + '...' : '未设置');
        
        // 更新环境变量
        process.env.DEEPSEEK_API_KEY = apiKey;
        
        console.log('更新后的API密钥:', process.env.DEEPSEEK_API_KEY);
        console.log('更新后的API密钥长度:', process.env.DEEPSEEK_API_KEY.length);
        
        // 更新 .env 文件
        const fs = require('fs');
        const path = require('path');
        
        // 更新 .env 文件
        const envPath = path.resolve(__dirname, '.env');
        let envContent = '';
        
        try {
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
                
                // 替换或添加 DEEPSEEK_API_KEY
                if (envContent.includes('DEEPSEEK_API_KEY=')) {
                    envContent = envContent.replace(
                        /DEEPSEEK_API_KEY=.*/,
                        `DEEPSEEK_API_KEY=${apiKey}`
                    );
                } else {
                    envContent += `\nDEEPSEEK_API_KEY=${apiKey}\n`;
                }
            } else {
                envContent = `DEEPSEEK_API_KEY=${apiKey}\n`;
            }
            
            fs.writeFileSync(envPath, envContent);
        } catch (error) {
            console.error('无法写入 .env 文件:', error);
            // 继续执行，因为我们已经更新了环境变量
        }
        
        console.log('API 密钥已更新');
        res.json({ success: true, message: 'API 密钥已更新' });
    } catch (error) {
        console.error('更新 API 密钥错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 添加一个专用的 API 密钥更新端点
app.post('/api/update-api-key-raw', (req, res) => {
    // 手动解析请求体
    let data = '';
    req.on('data', chunk => {
        data += chunk;
    });
    
    req.on('end', () => {
        try {
            console.log('收到原始请求体:', data);
            
            // 尝试解析 JSON
            let parsedData;
            try {
                parsedData = JSON.parse(data);
            } catch (e) {
                // 如果 JSON 解析失败，尝试解析 URL 编码
                const params = new URLSearchParams(data);
                parsedData = {
                    adminPassword: params.get('adminPassword'),
                    apiKey: params.get('apiKey')
                };
            }
            
            const { adminPassword, apiKey } = parsedData;
            
            console.log('解析后的 API 密钥:', apiKey);
            console.log('API 密钥长度:', apiKey.length);
            
            // 验证管理员密码
            const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
            if (adminPassword !== ADMIN_PASSWORD) {
                return res.status(401).json({ error: '密码不正确' });
            }
            
            // 更新环境变量
            process.env.DEEPSEEK_API_KEY = apiKey;
            
            console.log('API 密钥已更新');
            res.json({ success: true, message: 'API 密钥已更新' });
        } catch (error) {
            console.error('更新 API 密钥错误:', error);
            res.status(500).json({ error: error.message });
        }
    });
});

// 添加获取系统提示词的 API 端点
app.get('/api/get-system-prompt', (req, res) => {
    try {
        // 从环境变量获取系统提示词模板
        let systemPromptTemplate = process.env.SYSTEM_PROMPT_TEMPLATE || 
        `小学生在竖式计算中出现错误，简短思考关键出错原因（不超过1000字）。

- 题目：\${problemData.num1} \${problemData.type === 'addition' ? '+' : problemData.type === 'subtraction' ? '-' : '×'} \${problemData.num2}
- 正确答案：\${problemData.correctAnswer}
- 学生答案：\${problemData.userAnswer}`;
        
        res.json({ systemPrompt: systemPromptTemplate });
    } catch (error) {
        console.error('获取系统提示词错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 添加保存系统提示词的 API 端点
app.post('/api/save-system-prompt', (req, res) => {
    try {
        const { systemPrompt, adminPassword } = req.body;
        
        // 简单的管理密码验证
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
        if (adminPassword !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: '管理密码不正确' });
        }
        
        // 保存系统提示词到环境变量
        process.env.SYSTEM_PROMPT_TEMPLATE = systemPrompt;
        
        // 保存到配置文件（可选，需要文件系统权限）
        const fs = require('fs');
        const path = require('path');
        
        // 更新 .env 文件
        const envPath = path.resolve(__dirname, '.env');
        let envContent = '';
        
        try {
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
                
                // 替换或添加 SYSTEM_PROMPT_TEMPLATE
                if (envContent.includes('SYSTEM_PROMPT_TEMPLATE=')) {
                    envContent = envContent.replace(
                        /SYSTEM_PROMPT_TEMPLATE=.*/,
                        `SYSTEM_PROMPT_TEMPLATE="${systemPrompt.replace(/"/g, '\\"')}"`
                    );
                } else {
                    envContent += `\nSYSTEM_PROMPT_TEMPLATE="${systemPrompt.replace(/"/g, '\\"')}"\n`;
                }
            } else {
                envContent = `SYSTEM_PROMPT_TEMPLATE="${systemPrompt.replace(/"/g, '\\"')}"\n`;
            }
            
            fs.writeFileSync(envPath, envContent);
        } catch (error) {
            console.error('无法写入 .env 文件:', error);
            // 继续执行，因为我们已经更新了环境变量
        }
        
        console.log('系统提示词已更新');
        res.json({ success: true, message: '系统提示词已更新' });
    } catch (error) {
        console.error('保存系统提示词错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 添加保存运算类型提示词的 API 端点
app.post('/api/save-operation-prompts', (req, res) => {
    try {
        const { adminPassword, additionPrompt, subtractionPrompt, multiplicationPrompt } = req.body;
        
        // 简单的管理密码验证
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
        if (adminPassword !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: '管理密码不正确' });
        }
        
        // 保存运算类型提示词到环境变量
        process.env.ADDITION_PROMPT = additionPrompt;
        process.env.SUBTRACTION_PROMPT = subtractionPrompt;
        process.env.MULTIPLICATION_PROMPT = multiplicationPrompt;
        
        // 保存到配置文件（可选，需要文件系统权限）
        const fs = require('fs');
        const path = require('path');
        
        // 更新 .env 文件
        const envPath = path.resolve(__dirname, '.env');
        let envContent = '';
        
        try {
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
                
                // 替换或添加 ADDITION_PROMPT
                if (envContent.includes('ADDITION_PROMPT=')) {
                    envContent = envContent.replace(
                        /ADDITION_PROMPT=.*/,
                        `ADDITION_PROMPT="${additionPrompt.replace(/"/g, '\\"')}"`
                    );
                } else {
                    envContent += `\nADDITION_PROMPT="${additionPrompt.replace(/"/g, '\\"')}"\n`;
                }
                
                // 替换或添加 SUBTRACTION_PROMPT
                if (envContent.includes('SUBTRACTION_PROMPT=')) {
                    envContent = envContent.replace(
                        /SUBTRACTION_PROMPT=.*/,
                        `SUBTRACTION_PROMPT="${subtractionPrompt.replace(/"/g, '\\"')}"`
                    );
                } else {
                    envContent += `\nSUBTRACTION_PROMPT="${subtractionPrompt.replace(/"/g, '\\"')}"\n`;
                }
                
                // 替换或添加 MULTIPLICATION_PROMPT
                if (envContent.includes('MULTIPLICATION_PROMPT=')) {
                    envContent = envContent.replace(
                        /MULTIPLICATION_PROMPT=.*/,
                        `MULTIPLICATION_PROMPT="${multiplicationPrompt.replace(/"/g, '\\"')}"`
                    );
                } else {
                    envContent += `\nMULTIPLICATION_PROMPT="${multiplicationPrompt.replace(/"/g, '\\"')}"\n`;
                }
            } else {
                envContent = `ADDITION_PROMPT="${additionPrompt.replace(/"/g, '\\"')}"\n`;
                envContent += `SUBTRACTION_PROMPT="${subtractionPrompt.replace(/"/g, '\\"')}"\n`;
                envContent += `MULTIPLICATION_PROMPT="${multiplicationPrompt.replace(/"/g, '\\"')}"\n`;
            }
            
            fs.writeFileSync(envPath, envContent);
        } catch (error) {
            console.error('无法写入 .env 文件:', error);
            // 继续执行，因为我们已经更新了环境变量
        }
        
        console.log('运算提示词已更新');
        res.json({ success: true, message: '运算提示词已更新' });
    } catch (error) {
        console.error('保存运算提示词错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 添加获取运算类型提示词的 API 端点
app.get('/api/get-operation-prompts', (req, res) => {
    try {
        // 从环境变量获取运算类型提示词
        const additionPrompt = process.env.ADDITION_PROMPT || '请分析这道加法题的错误原因。';
        const subtractionPrompt = process.env.SUBTRACTION_PROMPT || '请分析这道减法题的错误原因。';
        const multiplicationPrompt = process.env.MULTIPLICATION_PROMPT || '请分析这道乘法题的错误原因，特别关注乘法竖式的计算步骤。';
        
        res.json({ 
            additionPrompt, 
            subtractionPrompt, 
            multiplicationPrompt 
        });
    } catch (error) {
        console.error('获取运算提示词错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 添加一个测试端点来验证当前 API 密钥
app.get('/api/test-api-key', (req, res) => {
    let DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
    res.json({ 
        apiKeyPrefix: DEEPSEEK_API_KEY.substring(0, 5) + '...',
        isDefault: DEEPSEEK_API_KEY === ''
    });
});

// 启动服务器
const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 