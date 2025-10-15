#!/bin/bash

# FileCodeBox 项目一键创建脚本
# 使用方法: ./create_project.sh [项目目录名]

set -e  # 遇到错误立即退出

PROJECT_NAME=${1:-"filecodebox-cloudflare"}
CURRENT_DIR=$(pwd)

echo "🚀 开始创建 FileCodeBox 项目: $PROJECT_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. 创建项目目录结构
echo "📁 创建项目目录结构..."
mkdir -p "$PROJECT_NAME"
cd "$PROJECT_NAME"

mkdir -p .github/workflows
mkdir -p src

echo "✅ 目录结构创建完成"

# 2. 创建 package.json
echo "📦 创建 package.json..."
cat > package.json << 'EOF'
{
  "name": "filecodebox-cloudflare",
  "version": "1.0.0",
  "description": "FileCodeBox deployed on Cloudflare Workers - 部署在 Cloudflare Workers 上的文件快递柜",
  "main": "src/index.js",
  "scripts": {
    "dev": "wrangler dev --local",
    "dev:remote": "wrangler dev",
    "deploy": "wrangler deploy",
    "deploy:staging": "wrangler deploy --env staging",
    "deploy:production": "wrangler deploy --env production",
    "build": "echo Build completed",
    "start": "wrangler dev",
    "logs": "wrangler tail"
  },
  "keywords": [
    "filecodebox",
    "cloudflare",
    "workers",
    "file-sharing",
    "文件分享"
  ],
  "author": "FileCodeBox Team",
  "license": "MIT",
  "devDependencies": {
    "wrangler": "^4.42.2"
  },
  "dependencies": {
    "hono": "^3.12.0",
    "uuid": "^9.0.1"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=8.0.0"
  }
}
EOF

echo "✅ package.json 创建完成"

# 3. 创建 wrangler.toml
echo "⚙️ 创建 wrangler.toml..."
cat > wrangler.toml << 'EOF'
name = "filecodebox"
main = "src/index.js"
compatibility_date = "2024-10-14"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "FILECODEBOX_KV"
id = "PLACEHOLDER_KV_ID"  # 需要创建 KV 命名空间后替换
preview_id = "PLACEHOLDER_KV_PREVIEW_ID"  # 需要创建 KV 命名空间后替换

[[r2_buckets]]
binding = "FILECODEBOX_R2"
bucket_name = "filecodebox-r2-f6bd1dfe"
preview_bucket_name = "filecodebox-r2-f6bd1dfe-preview"

[vars]
# 建议用 Secrets 配置敏感变量：
#   wrangler secret put PERMANENT_PASSWORD         # 永久保存的密码，默认 123456

# 以下为非敏感/容量限制等可公开变量（可按需覆盖默认值）
MAX_FILE_SIZE = "90"                               # 文件最大尺寸（MB 或字节）
MAX_TEXT_SIZE = "1"                                # 文本最大尺寸（MB 或字节）
QR_API = "https://api.qrserver.com/v1/create-qr-code/"   # 二维码服务地址
NOTICE_TTL_HOURS = "24"                           # 首次声明弹窗再次出现的间隔（小时）

# 速率限制（每分钟请求数上限）
UPLOAD_FILE_RPM = "10"
UPLOAD_TEXT_RPM = "20"
VERIFY_PERM_RPM = "20"
GET_INFO_RPM = "120"
DOWNLOAD_RPM = "60"

[triggers]
crons = ["*/5 * * * *"]
EOF

echo "✅ wrangler.toml 创建完成"

# 4. 创建 GitHub Actions 工作流
echo "🔄 创建 GitHub Actions 工作流..."
cat > .github/workflows/deploy.yml << 'EOF'
name: Deploy FileCodeBox to Cloudflare Workers

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:  # 允许手动触发

env:
  # 资源名称（使用项目中生成的名称）
  R2_BUCKET_NAME: "filecodebox-r2-f6bd1dfe"
  R2_PREVIEW_BUCKET_NAME: "filecodebox-r2-f6bd1dfe-preview"
  KV_NAMESPACE_NAME: "filecodebox-kv-2c88c777"

jobs:
  setup-and-deploy:
    runs-on: ubuntu-latest
    name: Setup Resources and Deploy
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Install Wrangler
      run: npm install -g wrangler

    - name: Authenticate with Cloudflare
      run: |
        echo "Setting up Cloudflare authentication..."
        wrangler whoami
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

    - name: Create R2 Buckets
      run: |
        echo "🪣 Creating R2 buckets..."
        
        # 创建主存储桶
        echo "Creating main bucket: $R2_BUCKET_NAME"
        if wrangler r2 bucket create "$R2_BUCKET_NAME" 2>/dev/null; then
          echo "✅ Main bucket created successfully"
        else
          echo "ℹ️ Main bucket might already exist, continuing..."
        fi
        
        # 创建预览存储桶
        echo "Creating preview bucket: $R2_PREVIEW_BUCKET_NAME"
        if wrangler r2 bucket create "$R2_PREVIEW_BUCKET_NAME" 2>/dev/null; then
          echo "✅ Preview bucket created successfully"
        else
          echo "ℹ️ Preview bucket might already exist, continuing..."
        fi
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

    - name: Create KV Namespaces
      id: create_kv
      run: |
        echo "🗄️ Creating KV namespaces..."
        
        # 创建主 KV 命名空间
        echo "Creating main KV namespace: $KV_NAMESPACE_NAME"
        KV_OUTPUT=$(wrangler kv:namespace create "$KV_NAMESPACE_NAME" 2>/dev/null || echo "exists")
        
        if [[ "$KV_OUTPUT" == "exists" ]]; then
          echo "ℹ️ Main KV namespace might already exist"
          # 尝试获取现有的 KV 命名空间列表
          KV_LIST=$(wrangler kv:namespace list)
          KV_ID=$(echo "$KV_LIST" | jq -r --arg name "$KV_NAMESPACE_NAME" '.[] | select(.title == $name) | .id' | head -1)
          if [[ -n "$KV_ID" && "$KV_ID" != "null" ]]; then
            echo "Found existing KV namespace ID: $KV_ID"
            echo "kv_id=$KV_ID" >> $GITHUB_OUTPUT
          else
            echo "❌ Could not find existing KV namespace"
            exit 1
          fi
        else
          echo "$KV_OUTPUT"
          KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | sed 's/id = "\(.*\)"/\1/')
          echo "✅ Main KV namespace created with ID: $KV_ID"
          echo "kv_id=$KV_ID" >> $GITHUB_OUTPUT
        fi
        
        # 创建预览 KV 命名空间
        echo "Creating preview KV namespace: $KV_NAMESPACE_NAME"
        KV_PREVIEW_OUTPUT=$(wrangler kv:namespace create "$KV_NAMESPACE_NAME" --preview 2>/dev/null || echo "exists")
        
        if [[ "$KV_PREVIEW_OUTPUT" == "exists" ]]; then
          echo "ℹ️ Preview KV namespace might already exist"
          # 尝试获取现有的预览 KV 命名空间
          KV_PREVIEW_ID=$(echo "$KV_LIST" | jq -r --arg name "${KV_NAMESPACE_NAME}_preview" '.[] | select(.title == $name) | .id' | head -1)
          if [[ -n "$KV_PREVIEW_ID" && "$KV_PREVIEW_ID" != "null" ]]; then
            echo "Found existing preview KV namespace ID: $KV_PREVIEW_ID"
            echo "kv_preview_id=$KV_PREVIEW_ID" >> $GITHUB_OUTPUT
          else
            echo "ℹ️ Could not find existing preview KV namespace, will use main KV ID"
            echo "kv_preview_id=$KV_ID" >> $GITHUB_OUTPUT
          fi
        else
          echo "$KV_PREVIEW_OUTPUT"
          KV_PREVIEW_ID=$(echo "$KV_PREVIEW_OUTPUT" | grep -o 'preview_id = "[^"]*"' | sed 's/preview_id = "\(.*\)"/\1/')
          if [[ -z "$KV_PREVIEW_ID" ]]; then
            # 如果没有找到 preview_id，尝试提取 id
            KV_PREVIEW_ID=$(echo "$KV_PREVIEW_OUTPUT" | grep -o 'id = "[^"]*"' | sed 's/id = "\(.*\)"/\1/')
          fi
          echo "✅ Preview KV namespace created with ID: $KV_PREVIEW_ID"
          echo "kv_preview_id=$KV_PREVIEW_ID" >> $GITHUB_OUTPUT
        fi
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

    - name: Update wrangler.toml with KV IDs
      run: |
        echo "📝 Updating wrangler.toml with actual KV IDs..."
        
        KV_ID="${{ steps.create_kv.outputs.kv_id }}"
        KV_PREVIEW_ID="${{ steps.create_kv.outputs.kv_preview_id }}"
        
        echo "Using KV ID: $KV_ID"
        echo "Using KV Preview ID: $KV_PREVIEW_ID"
        
        # 替换占位符
        sed -i "s/PLACEHOLDER_KV_ID/$KV_ID/g" wrangler.toml
        sed -i "s/PLACEHOLDER_KV_PREVIEW_ID/$KV_PREVIEW_ID/g" wrangler.toml
        
        echo "✅ wrangler.toml updated successfully"
        
        # 显示更新后的配置
        echo "Updated KV configuration:"
        grep -A 3 "kv_namespaces" wrangler.toml

    - name: Set up Secrets
      run: |
        echo "🔐 Setting up Cloudflare Workers secrets..."
        
        # 设置永久密码（如果提供）
        if [[ -n "${{ secrets.PERMANENT_PASSWORD }}" ]]; then
          echo "Setting PERMANENT_PASSWORD secret..."
          echo "${{ secrets.PERMANENT_PASSWORD }}" | wrangler secret put PERMANENT_PASSWORD
          echo "✅ PERMANENT_PASSWORD secret set"
        else
          echo "ℹ️ No PERMANENT_PASSWORD provided, using default"
        fi
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

    - name: Deploy to Cloudflare Workers
      run: |
        echo "🚀 Deploying to Cloudflare Workers..."
        
        # 设置环境变量（如果在 GitHub Variables 中定义）
        DEPLOY_ARGS=""
        
        # 添加可选的环境变量
        if [[ -n "${{ vars.MAX_FILE_SIZE }}" ]]; then
          DEPLOY_ARGS="$DEPLOY_ARGS --var MAX_FILE_SIZE=${{ vars.MAX_FILE_SIZE }}"
        fi
        
        if [[ -n "${{ vars.MAX_TEXT_SIZE }}" ]]; then
          DEPLOY_ARGS="$DEPLOY_ARGS --var MAX_TEXT_SIZE=${{ vars.MAX_TEXT_SIZE }}"
        fi
        
        if [[ -n "${{ vars.QR_API }}" ]]; then
          DEPLOY_ARGS="$DEPLOY_ARGS --var QR_API=${{ vars.QR_API }}"
        fi
        
        if [[ -n "${{ vars.NOTICE_TTL_HOURS }}" ]]; then
          DEPLOY_ARGS="$DEPLOY_ARGS --var NOTICE_TTL_HOURS=${{ vars.NOTICE_TTL_HOURS }}"
        fi
        
        # 速率限制变量
        if [[ -n "${{ vars.UPLOAD_FILE_RPM }}" ]]; then
          DEPLOY_ARGS="$DEPLOY_ARGS --var UPLOAD_FILE_RPM=${{ vars.UPLOAD_FILE_RPM }}"
        fi
        
        if [[ -n "${{ vars.UPLOAD_TEXT_RPM }}" ]]; then
          DEPLOY_ARGS="$DEPLOY_ARGS --var UPLOAD_TEXT_RPM=${{ vars.UPLOAD_TEXT_RPM }}"
        fi
        
        if [[ -n "${{ vars.VERIFY_PERM_RPM }}" ]]; then
          DEPLOY_ARGS="$DEPLOY_ARGS --var VERIFY_PERM_RPM=${{ vars.VERIFY_PERM_RPM }}"
        fi
        
        if [[ -n "${{ vars.GET_INFO_RPM }}" ]]; then
          DEPLOY_ARGS="$DEPLOY_ARGS --var GET_INFO_RPM=${{ vars.GET_INFO_RPM }}"
        fi
        
        if [[ -n "${{ vars.DOWNLOAD_RPM }}" ]]; then
          DEPLOY_ARGS="$DEPLOY_ARGS --var DOWNLOAD_RPM=${{ vars.DOWNLOAD_RPM }}"
        fi
        
        echo "Deploy arguments: $DEPLOY_ARGS"
        
        # 执行部署
        if [[ -n "$DEPLOY_ARGS" ]]; then
          wrangler deploy $DEPLOY_ARGS
        else
          wrangler deploy
        fi
        
        echo "✅ Deployment completed successfully!"
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

    - name: Get deployment info
      run: |
        echo "📋 Deployment Information:"
        echo "- R2 Bucket: $R2_BUCKET_NAME"
        echo "- R2 Preview Bucket: $R2_PREVIEW_BUCKET_NAME"
        echo "- KV Namespace: $KV_NAMESPACE_NAME"
        echo "- KV ID: ${{ steps.create_kv.outputs.kv_id }}"
        echo "- KV Preview ID: ${{ steps.create_kv.outputs.kv_preview_id }}"
        
        # 获取 Workers 域名
        echo ""
        echo "🌐 Your FileCodeBox is now deployed!"
        echo "Visit your Cloudflare Workers dashboard to get the deployment URL."
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  # 仅在 PR 时运行的验证作业
  validate-pr:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    name: Validate Configuration
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'

    - name: Validate wrangler.toml
      run: |
        echo "🔍 Validating wrangler.toml configuration..."
        
        # 检查必要的配置项
        if grep -q "FILECODEBOX_KV" wrangler.toml; then
          echo "✅ KV binding found"
        else
          echo "❌ KV binding not found"
          exit 1
        fi
        
        if grep -q "FILECODEBOX_R2" wrangler.toml; then
          echo "✅ R2 binding found"
        else
          echo "❌ R2 binding not found"
          exit 1
        fi
        
        if grep -q "filecodebox-r2-f6bd1dfe" wrangler.toml; then
          echo "✅ R2 bucket name configured"
        else
          echo "❌ R2 bucket name not configured"
          exit 1
        fi
        
        echo "✅ Configuration validation passed"

    - name: Check project structure
      run: |
        echo "📁 Checking project structure..."
        
        required_files=("src/index.js" "package.json" "wrangler.toml")
        for file in "${required_files[@]}"; do
          if [[ -f "$file" ]]; then
            echo "✅ $file exists"
          else
            echo "❌ $file is missing"
            exit 1
          fi
        done
        
        echo "✅ Project structure validation passed"
EOF

echo "✅ GitHub Actions 工作流创建完成"

# 5. 创建验证脚本
echo "🔍 创建验证脚本..."
cat > validate_github_actions.sh << 'EOF'
#!/bin/bash

echo "🔍 验证 GitHub Actions 配置..."

# 检查工作流文件
echo "📁 检查工作流文件..."
if [ -f ".github/workflows/deploy.yml" ]; then
    echo "✅ .github/workflows/deploy.yml 存在"
else
    echo "❌ .github/workflows/deploy.yml 不存在"
    exit 1
fi

# 检查必要的配置
echo ""
echo "⚙️ 检查工作流配置..."

# 检查触发条件
if grep -q "on:" .github/workflows/deploy.yml && grep -q "push:" .github/workflows/deploy.yml; then
    echo "✅ 推送触发器配置正确"
else
    echo "❌ 推送触发器配置缺失"
fi

if grep -q "workflow_dispatch:" .github/workflows/deploy.yml; then
    echo "✅ 手动触发器配置正确"
else
    echo "❌ 手动触发器配置缺失"
fi

# 检查环境变量
if grep -q "R2_BUCKET_NAME:" .github/workflows/deploy.yml; then
    echo "✅ R2 存储桶名称配置正确"
else
    echo "❌ R2 存储桶名称配置缺失"
fi

if grep -q "KV_NAMESPACE_NAME:" .github/workflows/deploy.yml; then
    echo "✅ KV 命名空间名称配置正确"
else
    echo "❌ KV 命名空间名称配置缺失"
fi

# 检查密钥引用
if grep -q "CLOUDFLARE_API_TOKEN" .github/workflows/deploy.yml; then
    echo "✅ Cloudflare API Token 引用正确"
else
    echo "❌ Cloudflare API Token 引用缺失"
fi

if grep -q "CLOUDFLARE_ACCOUNT_ID" .github/workflows/deploy.yml; then
    echo "✅ Cloudflare Account ID 引用正确"
else
    echo "❌ Cloudflare Account ID 引用缺失"
fi

# 检查项目文件
echo ""
echo "📋 检查项目文件..."
required_files=("package.json" "wrangler.toml")
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file 存在"
    else
        echo "❌ $file 缺失"
    fi
done

# 检查 src/index.js
if [ -f "src/index.js" ]; then
    echo "✅ src/index.js 存在"
else
    echo "⚠️ src/index.js 不存在 - 需要复制应用代码"
fi

# 生成配置摘要
echo ""
echo "📊 配置摘要:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 从工作流文件中提取资源名称
r2_bucket=$(grep "R2_BUCKET_NAME:" .github/workflows/deploy.yml | cut -d'"' -f2)
r2_preview_bucket=$(grep "R2_PREVIEW_BUCKET_NAME:" .github/workflows/deploy.yml | cut -d'"' -f2)
kv_namespace=$(grep "KV_NAMESPACE_NAME:" .github/workflows/deploy.yml | cut -d'"' -f2)

echo "🪣 R2 存储桶: $r2_bucket"
echo "🪣 R2 预览存储桶: $r2_preview_bucket"
echo "🗄️ KV 命名空间: $kv_namespace"

echo ""
echo "📝 下一步操作:"
echo "1. 复制 src/index.js 应用代码文件"
echo "2. 在 GitHub 仓库设置中添加以下 Secrets:"
echo "   - CLOUDFLARE_API_TOKEN"
echo "   - CLOUDFLARE_ACCOUNT_ID"
echo "   - PERMANENT_PASSWORD (可选)"
echo ""
echo "3. 推送代码到 main/master 分支触发自动部署"
echo ""
echo "✅ GitHub Actions 配置验证完成！"
EOF

chmod +x validate_github_actions.sh
echo "✅ 验证脚本创建完成"

# 6. 创建快速设置清单
echo "📋 创建快速设置清单..."
cat > QUICK_SETUP_CHECKLIST.md << 'EOF'
# 🚀 GitHub Actions 快速设置清单

## ✅ 配置检查清单

### 1. GitHub Secrets 设置（必需）
进入你的 GitHub 仓库 → Settings → Secrets and variables → Actions

#### 必需的 Secrets：
- [ ] `CLOUDFLARE_API_TOKEN` - 你的 Cloudflare API Token
- [ ] `CLOUDFLARE_ACCOUNT_ID` - 你的 Cloudflare Account ID

#### 可选的 Secrets：
- [ ] `PERMANENT_PASSWORD` - 永久保存功能密码（不设置则使用默认 123456）

### 2. 获取 Cloudflare 凭据

#### 获取 API Token：
1. [ ] 访问 https://dash.cloudflare.com/profile/api-tokens
2. [ ] 点击 "Create Token"
3. [ ] 选择 "Custom token"
4. [ ] 设置权限：
   - Account - Cloudflare Workers:Edit
   - Account - Account Settings:Read
   - Zone Resources - Include All zones（如需自定义域名）
   - Account Resources - Include All accounts
5. [ ] 复制 Token 并添加到 GitHub Secrets

#### 获取 Account ID：
1. [ ] 登录 https://dash.cloudflare.com/
2. [ ] 在右侧边栏找到 "Account ID"
3. [ ] 复制并添加到 GitHub Secrets

### 3. 部署验证

#### 自动部署：
- [ ] 推送代码到 `main` 或 `master` 分支
- [ ] 查看 GitHub Actions 页面确认部署成功
- [ ] 检查 Cloudflare Workers 控制台确认应用运行

## 🎯 自动创建的资源

工作流将自动创建以下 Cloudflare 资源：

### R2 存储桶：
- `filecodebox-r2-f6bd1dfe` （主存储桶）
- `filecodebox-r2-f6bd1dfe-preview` （预览存储桶）

### KV 命名空间：
- `filecodebox-kv-2c88c777` （主命名空间）
- `filecodebox-kv-2c88c777_preview` （预览命名空间）

## 📱 验证部署成功

部署成功后你应该能看到：
- [ ] GitHub Actions 显示绿色对勾 ✅
- [ ] Cloudflare Workers 控制台中出现新的 Worker
- [ ] 可以访问 Worker 的 URL 并看到 FileCodeBox 界面
- [ ] 可以正常上传和下载文件

## 🎉 完成！

配置完成后，你的 FileCodeBox 将：
- ✅ 自动部署到 Cloudflare Workers
- ✅ 自动创建和管理所需的云资源
- ✅ 支持文件和文本分享
- ✅ 具备完整的 CI/CD 流程

享受自动化部署的便利！🚀
EOF

echo "✅ 快速设置清单创建完成"

# 7. 创建 README.md
echo "📖 创建 README.md..."
cat > README.md << 'EOF'
# FileCodeBox on Cloudflare Workers

一个可匿名分享文件/文本、支持提取码的 Cloudflare Workers 应用。

## 🚀 功能特性

- 📁 **文件分享**: 支持最大 90MB 文件上传和分享
- 📝 **文本分享**: 支持文本内容快速分享
- 🔢 **提取码系统**: 6位数字提取码，安全便捷
- ⏰ **自动过期**: 支持按时间或次数自动清理
- 📱 **现代界面**: 响应式设计，支持移动端
- 🔗 **二维码分享**: 自动生成分享二维码
- 🛡️ **速率限制**: 内置防滥用保护

## 🎯 快速开始

### GitHub Actions 自动部署（推荐）

1. **设置 GitHub Secrets**:
   - `CLOUDFLARE_API_TOKEN` - 你的 Cloudflare API Token
   - `CLOUDFLARE_ACCOUNT_ID` - 你的 Cloudflare Account ID

2. **复制应用代码**: 将完整的 `src/index.js` 文件复制到项目中

3. **推送代码到 main 分支**，GitHub Actions 将自动：
   - 创建 Cloudflare R2 存储桶和 KV 命名空间
   - 配置应用设置
   - 部署到 Cloudflare Workers

4. **查看部署结果**:
   - 在 GitHub Actions 页面查看部署状态
   - 在 Cloudflare Workers 控制台获取访问链接

## 📖 详细文档

- 📋 [快速设置清单](QUICK_SETUP_CHECKLIST.md)
- 🔍 运行 `./validate_github_actions.sh` 验证配置

## 🔧 配置选项

### 环境变量
- `MAX_FILE_SIZE` - 文件最大尺寸（MB），默认 90
- `MAX_TEXT_SIZE` - 文本最大尺寸（MB），默认 1
- `QR_API` - 二维码服务地址
- `NOTICE_TTL_HOURS` - 声明弹窗间隔（小时），默认 24

### 速率限制
- `UPLOAD_FILE_RPM` - 文件上传每分钟限制，默认 10
- `UPLOAD_TEXT_RPM` - 文本上传每分钟限制，默认 20
- `DOWNLOAD_RPM` - 下载每分钟限制，默认 60

## 🛡️ 安全特性

- 基于 IP 的速率限制
- 自动文件过期清理
- 密码保护的永久保存功能
- 内容类型验证

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**快速开始**: 查看 [快速设置清单](QUICK_SETUP_CHECKLIST.md) 立即开始配置！
EOF

echo "✅ README.md 创建完成"

# 8. 创建 .gitignore
echo "🚫 创建 .gitignore..."
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Grunt intermediate storage (https://gruntjs.com/creating-plugins#storing-task-files)
.grunt

# Bower dependency directory (https://bower.io/)
bower_components

# node-waf configuration
.lock-wscript

# Compiled binary addons (https://nodejs.org/api/addons.html)
build/Release

# Dependency directories
jspm_packages/

# TypeScript v1 declaration files
typings/

# TypeScript cache
*.tsbuildinfo

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test
.env.local
.env.production

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Gatsby files
.cache/
public

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Logs
logs
*.log

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Wrangler
.wrangler/

# MacOS
.DS_Store

# Windows
Thumbs.db
ehthumbs.db
Desktop.ini

# Linux
*~

# Editor directories and files
.vscode/
.idea/
*.swp
*.swo
*~
EOF

echo "✅ .gitignore 创建完成"

# 9. 创建占位符的 src/index.js
echo "📄 创建 src/index.js 占位符..."
cat > src/index.js << 'EOF'
// FileCodeBox 主应用代码
// 
// ⚠️ 注意：这是一个占位符文件
// 
// 你需要将完整的 FileCodeBox 应用代码复制到这个文件中。
// 完整的代码包含约 2200 行，包括：
// - Web 界面 HTML/CSS/JavaScript
// - API 路由处理
// - 文件上传/下载逻辑
// - KV 存储管理
// - R2 存储操作
// - 速率限制中间件
//
// 请从现有的项目中复制完整的 src/index.js 文件内容到这里。

import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => {
  return c.text('FileCodeBox - Please copy the complete application code to src/index.js');
});

export default {
  fetch: app.fetch,
};
EOF

echo "✅ src/index.js 占位符创建完成"

# 10. 显示完成信息
echo ""
echo "🎉 项目创建完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 项目位置: $(pwd)"
echo ""
echo "📋 创建的文件："
echo "├── .github/workflows/deploy.yml    # GitHub Actions 工作流"
echo "├── src/index.js                    # 应用代码（占位符）"
echo "├── package.json                    # Node.js 配置"
echo "├── wrangler.toml                   # Cloudflare Workers 配置"
echo "├── validate_github_actions.sh      # 配置验证脚本"
echo "├── QUICK_SETUP_CHECKLIST.md       # 快速设置清单"
echo "├── README.md                       # 项目说明"
echo "└── .gitignore                      # Git 忽略文件"
echo ""
echo "⚠️ 重要提醒："
echo "1. 需要将完整的 FileCodeBox 应用代码复制到 src/index.js"
echo "2. 在 GitHub 仓库中设置 Cloudflare API Token 和 Account ID"
echo "3. 推送代码到 main/master 分支触发自动部署"
echo ""
echo "🔍 验证配置："
echo "cd $PROJECT_NAME && ./validate_github_actions.sh"
echo ""
echo "📖 查看详细说明："
echo "cat QUICK_SETUP_CHECKLIST.md"
echo ""
echo "🚀 开始使用 FileCodeBox！"

# 返回原始目录
cd "$CURRENT_DIR"
EOF

chmod +x create_project.sh
```

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "create_final_commands_script", "content": "\u521b\u5efa\u4e00\u952e\u521b\u5efa\u811a\u672c", "status": "completed"}]