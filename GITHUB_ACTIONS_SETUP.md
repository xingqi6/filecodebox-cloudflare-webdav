# GitHub Actions 自动部署配置指南

## 🎯 概述

我已经为你创建了完整的 GitHub Actions 工作流，可以自动创建 Cloudflare 资源并部署 FileCodeBox 应用。

## 📋 工作流功能

### 自动化流程
1. **资源创建**: 自动创建 R2 存储桶和 KV 命名空间
2. **配置更新**: 自动更新 `wrangler.toml` 中的资源 ID
3. **密钥设置**: 自动配置 Cloudflare Workers 密钥
4. **应用部署**: 自动部署到 Cloudflare Workers
5. **配置验证**: PR 时自动验证配置文件

### 触发条件
- 推送到 `main` 或 `master` 分支
- 创建 Pull Request
- 手动触发（workflow_dispatch）

## 🔧 配置步骤

### 1. 设置 GitHub Secrets（必需）

在你的 GitHub 仓库中，进入 `Settings` → `Secrets and variables` → `Actions`，添加以下 **Secrets**：

#### 必需的 Secrets：
```
CLOUDFLARE_API_TOKEN     # Cloudflare API Token
CLOUDFLARE_ACCOUNT_ID    # Cloudflare Account ID
```

#### 可选的 Secrets：
```
PERMANENT_PASSWORD       # 永久保存功能的密码（默认: 123456）
```

### 2. 设置 GitHub Variables（可选）

在同一页面的 `Variables` 标签下，可以添加以下环境变量来覆盖默认配置：

#### 文件大小限制：
```
MAX_FILE_SIZE           # 文件最大尺寸（MB），默认: 90
MAX_TEXT_SIZE           # 文本最大尺寸（MB），默认: 1
```

#### 服务配置：
```
QR_API                  # 二维码服务地址，默认: https://api.qrserver.com/v1/create-qr-code/
NOTICE_TTL_HOURS        # 首次声明弹窗间隔（小时），默认: 24
```

#### 速率限制（每分钟请求数）：
```
UPLOAD_FILE_RPM         # 文件上传限制，默认: 10
UPLOAD_TEXT_RPM         # 文本上传限制，默认: 20
VERIFY_PERM_RPM         # 密码验证限制，默认: 20
GET_INFO_RPM            # 信息获取限制，默认: 120
DOWNLOAD_RPM            # 下载限制，默认: 60
```

## 🔑 获取 Cloudflare 凭据

### 1. 获取 API Token

1. 访问 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 "Create Token"
3. 选择 "Custom token" 模板
4. 设置权限：
   - **Account** - `Cloudflare Workers:Edit`
   - **Account** - `Account Settings:Read`
   - **Zone Resources** - `Include All zones` (如果需要自定义域名)
   - **Account Resources** - `Include All accounts`
5. 复制生成的 Token 并添加到 GitHub Secrets 中的 `CLOUDFLARE_API_TOKEN`

### 2. 获取 Account ID

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 在右侧边栏找到 "Account ID"
3. 复制 Account ID 并添加到 GitHub Secrets 中的 `CLOUDFLARE_ACCOUNT_ID`

## 🚀 使用方法

### 自动部署
1. 完成上述配置后，推送代码到 `main` 或 `master` 分支
2. GitHub Actions 将自动运行并完成部署
3. 查看 Actions 页面了解部署进度和结果

### 手动触发
1. 进入 GitHub 仓库的 `Actions` 页面
2. 选择 "Deploy FileCodeBox to Cloudflare Workers" 工作流
3. 点击 "Run workflow" 按钮
4. 选择分支并点击 "Run workflow"

### 验证 PR
- 创建 Pull Request 时会自动运行配置验证
- 验证通过后才建议合并到主分支

## 📊 工作流状态

### 成功指标
- ✅ 所有步骤都显示绿色对勾
- ✅ 在 Actions 日志中看到 "Deployment completed successfully!"
- ✅ 可以访问部署的 Workers 应用

### 常见问题排查

#### 1. API Token 权限不足
```
Error: Authentication failed
```
**解决方案**: 检查 API Token 权限，确保包含 Workers 编辑权限

#### 2. Account ID 错误
```
Error: Account not found
```
**解决方案**: 验证 Account ID 是否正确

#### 3. 资源名称冲突
```
Error: Bucket already exists
```
**解决方案**: 工作流会自动处理已存在的资源，这通常不是问题

#### 4. KV 命名空间创建失败
```
Error: Failed to create KV namespace
```
**解决方案**: 检查账户配额和权限

## 📁 生成的资源

工作流将创建以下资源：

### R2 存储桶
- **主存储桶**: `filecodebox-r2-f6bd1dfe`
- **预览存储桶**: `filecodebox-r2-f6bd1dfe-preview`

### KV 命名空间
- **主命名空间**: `filecodebox-kv-2c88c777`
- **预览命名空间**: `filecodebox-kv-2c88c777_preview`

## 🔄 工作流文件结构

```
.github/
└── workflows/
    └── deploy.yml          # 主部署工作流
```

## 🛡️ 安全最佳实践

1. **API Token 管理**:
   - 定期轮换 API Token
   - 使用最小权限原则
   - 不要在代码中硬编码 Token

2. **Secrets 管理**:
   - 只在必要的仓库中设置 Secrets
   - 定期审查 Secrets 使用情况
   - 使用环境保护规则限制部署

3. **工作流安全**:
   - 审查所有 PR 中的工作流更改
   - 限制谁可以触发工作流
   - 监控工作流执行日志

## 📈 监控和维护

### 监控部署
- 定期检查 Actions 页面的执行历史
- 设置通知以获取失败的部署信息
- 监控 Cloudflare Workers 的使用情况

### 维护任务
- 定期更新依赖项
- 监控 Cloudflare 服务状态
- 备份重要配置和数据

## 🎉 完成！

配置完成后，你的 FileCodeBox 应用将：
- 在每次推送到主分支时自动部署
- 自动创建和管理 Cloudflare 资源
- 提供完整的 CI/CD 流程
- 支持配置验证和错误处理

享受自动化部署的便利！🚀