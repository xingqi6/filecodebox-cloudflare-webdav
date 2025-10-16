# FileCodeBox on Cloudflare Workers

一个可匿名分享文件/文本、支持提取码的 Cloudflare Workers 应用。

## 一键部署

1) 安装 Wrangler（如未安装）
```bash
npm i -g wrangler
```

2) 配置绑定（需先在 Cloudflare 创建 KV 与 R2）
- KV Namespace 绑定名：`FILECODEBOX_KV`
- R2 Bucket 绑定名：`FILECODEBOX_R2`

3) 配置 Secret（敏感项）
```bash
wrangler secret put PERMANENT_PASSWORD   # 留空则使用默认 123456
```

4) 首次部署（可带上默认变量，也可省略使用默认值）
```bash
wrangler deploy \
  --var MAX_FILE_SIZE=90 \
  --var MAX_TEXT_SIZE=1 \
  --var QR_API=https://api.qrserver.com/v1/create-qr-code/ \
  --var NOTICE_TTL_HOURS=24 \
  --var UPLOAD_FILE_RPM=10 \
  --var UPLOAD_TEXT_RPM=20 \
  --var VERIFY_PERM_RPM=20 \
  --var GET_INFO_RPM=120 \
  --var DOWNLOAD_RPM=60
```

说明：
- `MAX_FILE_SIZE`、`MAX_TEXT_SIZE` 支持「MB」或大于 100000 的字节数。
- `PERMANENT_PASSWORD` 未设置时，默认 `123456`。
- 可通过 `QR_API` 切换二维码服务。
- `NOTICE_TTL_HOURS` 控制首次声明弹窗 24h/自定义小时重复出现。
- 速率限制值均为每分钟上限，按需调整。

## 本地开发
```bash
wrangler dev
```

## 常用维护
- 更新某个变量：直接修改 `--var` 值后再 `wrangler deploy`。
- 更新 Secret：
```bash
wrangler secret delete PERMANENT_PASSWORD
wrangler secret put PERMANENT_PASSWORD
```

## 环境变量一览

## 使用 GitHub Actions 自动部署（推荐）

本项目已内置工作流 `.github/workflows/deploy.yml`，在你 Push 到 `main/master` 时自动部署到 Cloudflare Workers。

### 🚀 快速开始（全自动）

**只需 2 步，无需手动创建 KV 和 R2！**

#### 第 1 步：配置必需的 Secrets

在 GitHub 仓库 `Settings` → `Secrets and variables` → `Actions` → `New repository secret` 添加：

1. **CLOUDFLARE_API_TOKEN**（必需）
   - 在 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) 创建 API Token
   - 需要包含 `Account - Cloudflare Workers Scripts:Edit` 权限
   - 建议使用 "Edit Cloudflare Workers" 模板

2. **CLOUDFLARE_ACCOUNT_ID**（必需）
   - 在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 右侧可找到 Account ID

#### 第 2 步：触发部署

- **方式 1**：直接 Push 代码到 `main` 或 `master` 分支
- **方式 2**：在 GitHub Actions 页面手动点击 "Run workflow"

### ✨ 自动化功能

GitHub Action 会自动完成以下操作：

✅ 自动创建 KV Namespace（如果不存在）  
✅ 自动创建 R2 Bucket（如果不存在）  
✅ 自动获取资源 ID 并配置  
✅ 自动设置永久密码（默认：123456）  
✅ 自动部署到 Cloudflare Workers  

### 🔐 可选配置

#### 自定义永久密码

在 Secrets 中添加 `PERMANENT_PASSWORD`（可选）：
- 不设置：使用默认密码 `123456`
- 设置后：使用你的自定义密码

#### 其他环境变量

这些变量已在 `wrangler.toml` 中配置默认值，通常无需修改：
- `MAX_FILE_SIZE=90`（文件最大尺寸 MB）
- `MAX_TEXT_SIZE=1`（文本最大尺寸 MB）
- `QR_API`（二维码服务地址）
- `NOTICE_TTL_HOURS=24`（声明弹窗间隔小时）
- 速率限制：`UPLOAD_FILE_RPM`、`UPLOAD_TEXT_RPM`、`VERIFY_PERM_RPM`、`GET_INFO_RPM`、`DOWNLOAD_RPM`

### 📝 部署说明

- 首次部署会自动创建所有必需的 Cloudflare 资源
- 后续部署会复用已存在的资源
- KV Namespace 名称：`FILECODEBOX_KV`
- R2 Bucket 名称：`filecodebox-storage`
- 部署成功后即可使用你的文件快递柜！
