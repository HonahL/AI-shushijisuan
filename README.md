# AI-shushijisuan

接入DeepSeek-R1大模型做错因分析的竖式计算应用程序。

## 项目结构

- `public/` - 静态前端文件
- `netlify/functions/` - Netlify无服务器函数
- `竖式计算/` - 竖式计算相关代码

## 部署说明

本项目配置为使用Netlify部署。主要设置：

1. 前端文件在 `public/` 目录
2. 服务器功能在 `netlify/functions/` 目录
3. 配置文件包括 `netlify.toml` 和 `_redirects`

## 环境变量

请在Netlify中设置以下环境变量：

- `DEEPSEEK_API_KEY` - DeepSeek API密钥
- `ADMIN_PASSWORD` - 管理员密码
- `SYSTEM_PROMPT_TEMPLATE` - 系统提示词模板
