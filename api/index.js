const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量，指定 .env 文件的路径
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 创建Express应用
const app = express();
app.use(cors());
app.use(express.json());

// 从环境变量获取API密钥，如果不可用则使用硬编码的密钥
let DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
// 如果环境变量中的API密钥无效或包含占位符，使用硬编码的密钥
if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.includes('你的') || DEEPSEEK_API_KEY.includes('实际')) {
    DEEPSEEK_API_KEY = 'sk-3cf38d5043e0441f8442e443cf361878';
    console.log('使用硬编码的API密钥');
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '0512';

// 打印API密钥的前几个字符（出于安全考虑不打印完整密钥）
console.log('API密钥前缀:', DEEPSEEK_API_KEY ? DEEPSEEK_API_KEY.substring(0, 5) + '...' : 'undefined');

// 分析接口
app.post('/api/analyze', async (req, res) => {
    try {
        const { prompt } = req.body;
        let { problemData } = req.body;
        
        console.log('收到分析请求，提示词:', prompt.substring(0, 50) + '...');
        console.log('题目数据:', JSON.stringify(problemData));
        
        // 检查 problemData 是否存在，如果不存在则使用默认值
        if (!problemData) {
            console.log('警告: problemData 未定义，使用默认值');
            problemData = {
                type: 'unknown',
                num1: '?',
                num2: '?',
                correctAnswer: '?',
                userAnswer: '?'
            };
        }
        
        // 设置响应头以支持流式输出
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // 调用DeepSeek API
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        };
        console.log('请求头:', JSON.stringify(headers).replace(DEEPSEEK_API_KEY, '***'));
        
        // 从环境变量获取系统提示词模板，如果不存在则使用默认值
        const systemPromptTemplate = process.env.SYSTEM_PROMPT_TEMPLATE || 
        `小学生在竖式计算中出现错误，简短思考关键出错原因（不超过1000字）。`;
        
        // 硬编码的题目数据部分
        const problemDataTemplate = `
        - 题目：${problemData.num1} ${problemData.type === 'addition' ? '+' : problemData.type === 'subtraction' ? '-' : '×'} ${problemData.num2}
        - 正确答案：${problemData.correctAnswer}
        - 学生答案：${problemData.userAnswer}
        `;
        
        // 前端已经包含了运算类型提示词，直接使用
        const enhancedPrompt = prompt;
        
        console.log('------- 系统提示词开始 -------');
        console.log(enhancedPrompt);
        console.log('------- 系统提示词结束 -------');
        
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: "deepseek-reasoner",  // 使用 DeepSeek-R1 推理模型
                messages: [
                    {
                        role: "system", 
                        content: enhancedPrompt
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                stream: true,  // 启用流式输出
                temperature: 0.1,  // 使用官方推荐的温度值
                //max_tokens: 800    // 限制最终答案的长度
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
        
        // 跟踪收到的内容块数量和最后内容时间
        let contentChunks = 0;
        let lastContentTime = Date.now();
        let noContentTimer = null;
        let hasStartedReceivingContent = false;
        
        // 设置无内容检测定时器
        const setupNoContentTimer = () => {
            clearTimeout(noContentTimer);
            noContentTimer = setTimeout(() => {
                // 如果已经开始接收内容，并且20秒内没有新内容，则认为响应已结束
                if (hasStartedReceivingContent) {
                    console.log(`20秒内没有新内容，已接收${contentChunks}个内容块，认为响应已完成`);
                    res.write('data: [DONE]\n\n');
                    clearTimeout(timeout);
                    res.end();
                } else {
                    console.log(`等待API开始返回内容...`);
                    // 不再重新设置定时器，让主超时计时器处理
                }
            }, 20000); // 20秒无新内容超时
        };
        
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
                        clearTimeout(noContentTimer);
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
                                    // 标记已开始接收内容
                                    hasStartedReceivingContent = true;
                                    
                                    // 更新计数器和时间戳
                                    contentChunks++;
                                    lastContentTime = Date.now();
                                    
                                    // 重置无内容定时器
                                    setupNoContentTimer();
                                    
                                    // 发送内容到前端，指定类型
                                    res.write(`data: ${JSON.stringify({ type: contentType, content })}\n\n`);
                                }
                            }
                            
                            // 检查是否有结束原因
                            if (parsedData.choices && parsedData.choices[0]?.finish_reason) {
                                console.log('检测到结束原因:', parsedData.choices[0].finish_reason);
                                res.write('data: [DONE]\n\n');
                                clearTimeout(timeout);
                                clearTimeout(noContentTimer);
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
        
        // 初始化无内容定时器
        setupNoContentTimer();
        
        // 处理流结束
        response.body.on('end', () => {
            console.log('流式响应结束');
            clearTimeout(timeout);
            clearTimeout(noContentTimer);
            // 确保响应已经结束
            res.end();
        });
        
        // 处理错误
        response.body.on('error', (err) => {
            console.error('流处理错误:', err);
            clearTimeout(timeout);
            clearTimeout(noContentTimer);
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        });
    } catch (error) {
        console.error('API错误:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// 更新API密钥接口
app.post('/api/update-api-key', async (req, res) => {
    const { apiKey, adminPassword } = req.body;
    
    // 可能是转发到Netlify函数
    // 或者直接处理请求
});

// 添加保存运算类型提示词的 API 端点
app.post('/api/save-operation-prompts', (req, res) => {
    try {
        const { adminPassword, additionPrompt, subtractionPrompt, multiplicationPrompt } = req.body;
        
        // 简单的管理密码验证
        if (adminPassword !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: '管理密码不正确' });
        }
        
        // 保存运算类型提示词到环境变量
        process.env.ADDITION_PROMPT = additionPrompt;
        process.env.SUBTRACTION_PROMPT = subtractionPrompt;
        process.env.MULTIPLICATION_PROMPT = multiplicationPrompt;
        
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

// 如果不是作为模块导入，则启动服务器
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`服务器运行在端口 ${PORT}`);
    });
}

// 导出为Vercel Serverless函数
module.exports = app; 