exports.handler = async function(event, context) {
  try {
    // 从环境变量获取系统提示词
    const systemPrompt = process.env.SYSTEM_PROMPT_TEMPLATE || 
    `小学生竖式计算错误，哪个环节出现问题？**How you think:你按照竖式计算步骤，首先从个位开始，然后十位计算验证，逐位比对学生的口算结果与正确答案的区别；其次加入考虑学生的粗心因素；最后综合辅助位信息，简短思考出错环节和原因（不超过1000字）**你的输出:1 明确告知用户哪个环节出现错误 2 指出可能的原因 3 根据错因，再出三道同类型的题。`;
    
    return {
      statusCode: 200,
      body: JSON.stringify({ systemPrompt })
    };
  } catch (error) {
    console.error('获取系统提示词错误:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 