exports.handler = async function(event, context) {
  try {
    // 从环境变量获取运算类型提示词
    const additionPrompt = process.env.ADDITION_PROMPT || '请分析这道加法题的错误原因。';
    const subtractionPrompt = process.env.SUBTRACTION_PROMPT || '请分析这道减法题的错误原因。';
    const multiplicationPrompt = process.env.MULTIPLICATION_PROMPT || '请分析这道乘法题的错误原因，特别关注乘法竖式的计算步骤。';
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        additionPrompt, 
        subtractionPrompt, 
        multiplicationPrompt 
      })
    };
  } catch (error) {
    console.error('获取运算提示词错误:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 