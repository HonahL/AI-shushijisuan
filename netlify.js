// netlify.js - Netlify Node.js配置文件
// 这个文件帮助Netlify理解如何处理您的Node.js应用

exports.handler = async function(event, context) {
  // 这个函数不会被直接调用，但是它的存在告诉Netlify这是一个Node.js应用
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Netlify配置文件加载成功" })
  };
}; 