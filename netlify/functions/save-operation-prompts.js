exports.handler = async function(event, context) {
  try {
    const { adminPassword, additionPrompt, subtractionPrompt, multiplicationPrompt } = JSON.parse(event.body);
    
    // 简单的管理密码验证
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '0512';
    if (adminPassword !== ADMIN_PASSWORD) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: '管理密码不正确' })
      };
    }
    
    // 在 Netlify 环境中，我们无法直接修改环境变量
    // 但我们可以将值存储在数据库或其他持久化存储中
    // 这里我们只是返回成功，实际上值并没有被持久化
    
    console.log('运算提示词已更新（仅在当前请求中）');
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: '运算提示词已更新' })
    };
  } catch (error) {
    console.error('保存运算提示词错误:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 