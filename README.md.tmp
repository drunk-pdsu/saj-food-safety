# 食安警戒 · AI膳食管理（一键部署仓库）

一款面向老年/慢病人群的 AI 膳食安全管理 Web 应用：拍照/上传饭菜 → 视觉大模型识别食物并估重营养 → 结合个人健康档案做「食用前安全扫描」→ 记录 → 亲情关怀（跨设备关联家人、远程看其今日饮食）→ 可分享安全报告卡片。无需安装，手机/电脑浏览器即用，可添加到主屏。

## 🚀 一键部署

点击下方按钮，授权后平台会自动拉取本仓库代码、安装依赖并部署，完成后给你一个**公网地址**，任何人打开即可直接使用（无需与你在同一局域网）。

**Deploy on Railway：**
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new?template=https://github.com/drunk-pdsu/saj-food-safety)

**Deploy to Render：**
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/drunk-pdsu/saj-food-safety)

> 使用前请把上面两个链接里的 `drunk-pdsu/saj-food-safety` 替换成你实际的 GitHub 仓库地址。

## 🔑 部署后必填：视觉模型环境变量

为保障密钥安全，本仓库已用 `.gitignore` 排除 `.env`（不会随代码公开）。部署成功后，请在平台后台的 **Variables（环境变量）** 中添加以下 4 项（直接复制值）：

```
VISION_API_KEY=701cff7d671540aebe8b6713390da8e9.WMJxkYGYzV1rsVAq
VISION_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISION_MODEL=glm-4v-plus
VISION_FALLBACK_MODEL=glm-4v-flash
```

> 说明：以上为演示用密钥，正式发布请到 open.bigmodel.cn 自行申请替换。

## 👤 演示账号（服务器重启会自动重建）

- 我的：`13800138000` / `demo123`
- 家人：`13800138001` / `demo123`（已含今日饮食：米饭+咸菜）
- 体验路径：用 `13800138000/demo123` 登录 → 💗 亲情关怀 → 云端关联家人 → 输入 `13800138001/demo123` → 即可看「妈妈」今日吃了什么。

## 💻 本地运行

```bash
npm install
npm start
# 浏览器打开 http://localhost:8081
```

## 📦 目录说明

- `index.html` / `app.js`：前端（PWA，可添加到主屏）
- `server.js`：Node 服务端（静态托管 + 视觉识别代理 + 账号/关联云后端，数据存 `data.json`）
- `manifest.json` / `sw.js` / `icon.svg`：PWA 资源
- `.env`：**已被忽略**，识别密钥请通过平台环境变量配置
- `data.json`：运行时自动生成，已忽略

## ⚠️ 说明

免费演示主机（Railway/Render 免费额度）可能休眠或重启，重启后用户新注册数据会清空；预置演示账号每次自动重建，演示永远可用。如需永久保存用户数据，可升级主机或接入数据库。
