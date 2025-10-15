# 🚀 GitHub Actions 快速设置清单

## ✅ 配置检查清单

### 1. GitHub Secrets 设置（必需）
进入你的 GitHub 仓库 → Settings → Secrets and variables → Actions

#### 必需的 Secrets：
- [ ] `CLOUDFLARE_API_TOKEN` - 你的 Cloudflare API Token
- [ ] `CLOUDFLARE_ACCOUNT_ID` - 你的 Cloudflare Account ID

#### 可选的 Secrets：
- [ ] `PERMANENT_PASSWORD` - 永久保存功能密码（不设置则使用默认 123456）

### 2. GitHub Variables 设置（可选）
在同一页面的 Variables 标签下：

#### 文件大小配置：
- [ ] `MAX_FILE_SIZE` - 最大文件大小（MB），默认 90
- [ ] `MAX_TEXT_SIZE` - 最大文本大小（MB），默认 1

#### 服务配置：
- [ ] `QR_API` - 二维码服务 API，默认使用 qrserver.com
- [ ] `NOTICE_TTL_HOURS` - 声明弹窗间隔（小时），默认 24

#### 速率限制配置：
- [ ] `UPLOAD_FILE_RPM` - 文件上传每分钟限制，默认 10
- [ ] `UPLOAD_TEXT_RPM` - 文本上传每分钟限制，默认 20
- [ ] `VERIFY_PERM_RPM` - 密码验证每分钟限制，默认 20
- [ ] `GET_INFO_RPM` - 信息获取每分钟限制，默认 120
- [ ] `DOWNLOAD_RPM` - 下载每分钟限制，默认 60

### 3. 获取 Cloudflare 凭据

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

### 4. 部署验证

#### 自动部署：
- [ ] 推送代码到 `main` 或 `master` 分支
- [ ] 查看 GitHub Actions 页面确认部署成功
- [ ] 检查 Cloudflare Workers 控制台确认应用运行

#### 手动部署：
- [ ] 进入 GitHub Actions 页面
- [ ] 选择 "Deploy FileCodeBox to Cloudflare Workers"
- [ ] 点击 "Run workflow"

## 🎯 自动创建的资源

工作流将自动创建以下 Cloudflare 资源：

### R2 存储桶：
- `filecodebox-r2-f6bd1dfe` （主存储桶）
- `filecodebox-r2-f6bd1dfe-preview` （预览存储桶）

### KV 命名空间：
- `filecodebox-kv-2c88c777` （主命名空间）
- `filecodebox-kv-2c88c777_preview` （预览命名空间）

## 🔧 故障排除

### 常见问题：

#### API Token 权限不足
```
Error: Authentication failed
```
**解决方案**: 检查 API Token 权限，确保包含 Workers 编辑权限

#### Account ID 错误
```
Error: Account not found
```
**解决方案**: 验证 Account ID 是否正确复制

#### 资源已存在
```
Error: Bucket already exists
```
**解决方案**: 这是正常的，工作流会自动处理已存在的资源

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

---

**需要帮助？** 查看详细文档：
- 📖 [GitHub Actions 详细设置指南](GITHUB_ACTIONS_SETUP.md)
- 📖 [项目总结](PROJECT_SUMMARY.md)
- 🔍 运行 `./validate_github_actions.sh` 验证配置