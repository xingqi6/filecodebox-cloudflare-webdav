# FileCodeBox - Cloudflare Workers 版本

基于 Cloudflare Workers 的匿名文件快递柜，支持文件和文本的临时分享。

## ✨ 特性

- 📦 支持文件和文本分享
- 🔐 6位数字提取码
- ⏰ 灵活的过期时间设置（分钟/小时/天/永久）
- 🌐 使用 WebDAV 作为存储后端
- 🚀 基于 Cloudflare Workers 边缘计算
- 📱 响应式设计，支持移动端
- 🔒 内置速率限制保护
- 🧹 自动清理过期文件

## 📋 前置要求

1. **Cloudflare 账号**
   - 免费账号即可
   - 需要获取 API Token 和 Account ID

2. **WebDAV 存储服务**
   - 可以使用 TeraCloud、坚果云、Nextcloud 等
   - 需要 WebDAV 地址、用户名和密码

3. **GitHub 账号**（用于 GitHub Actions 自动部署）

## 🚀 快速开始

### 1️⃣ Fork 本仓库

点击右上角的 Fork 按钮，将仓库复制到你的 GitHub 账号下。

### 2️⃣ 获取 Cloudflare 凭证

#### 获取 Account ID
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 在右侧找到你的 **Account ID**
3. 复制保存

#### 获取 API Token
1. 访问 [API Tokens 页面](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 "Create Token"
3. 使用 "Edit Cloudflare Workers" 模板
4. 或自定义权限：
   - Account - Workers KV Storage - Edit
   - Account - Workers Scripts - Edit
5. 创建后复制保存（只显示一次）

### 3️⃣ 准备 WebDAV 存储

#### 推荐服务商

**TeraCloud（日本，免费 10GB）**
- 注册地址：https://teracloud.jp
- WebDAV 地址：`https://[你的用户名].teracloud.jp/dav/`
- 获取方式：注册后即可使用

**坚果云（中国，免费 1GB 月上传）**
- 注册地址：https://www.jianguoyun.com
- 需要在设置中开启 WebDAV
- WebDAV 地址：`https://dav.jianguoyun.com/dav/`

**Nextcloud（自建）**
- WebDAV 地址：`https://your-domain.com/remote.php/dav/files/username/`

### 4️⃣ 配置 GitHub Secrets

在你 Fork 的仓库中设置以下 Secrets：

1. 进入仓库的 `Settings` → `Secrets and variables` → `Actions`
2. 点击 `New repository secret` 添加以下变量：

#### 必需的 Secrets

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | `xxxx-your-api-token-xxxx` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID | `abc123def456` |
| `WEBDAV_PASSWORD` | WebDAV 密码 | `your_webdav_password` |
| `PERMANENT_PASSWORD` | 永久保存功能密码（可选） | `123456`（默认值） |

#### 必需的 Variables

在 `Variables` 标签页添加：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `WEBDAV_URL` | WebDAV 地址 | `https://zeze.teracloud.jp/dav/` |
| `WEBDAV_USERNAME` | WebDAV 用户名 | `your_username` |

### 5️⃣ 触发部署

有两种方式触发部署：

#### 方法一：推送代码
```bash
git commit --allow-empty -m "Trigger deployment"
git push
```

#### 方法二：手动触发
1. 进入仓库的 `Actions` 标签
2. 选择 "Deploy to Cloudflare Workers"
3. 点击 "Run workflow"

### 6️⃣ 查看部署结果

1. 部署完成后，访问 [Cloudflare Workers Dashboard](https://dash.cloudflare.com/?to=/:account/workers)
2. 找到名为 `filecodebox` 的 Worker
3. 点击查看部署的 URL（如：`https://filecodebox.your-subdomain.workers.dev`）

## ⚙️ 可选配置

### 自定义环境变量

在 `wrangler.toml` 文件中可以修改以下配置：

```toml
[vars]
# 文件大小限制（MB 或字节）
MAX_FILE_SIZE = "90"              # 默认 90MB
MAX_TEXT_SIZE = "5"               # 默认 5MB

# 二维码生成服务
QR_API = "https://api.qrserver.com/v1/create-qr-code/"

# 首次声明弹窗间隔（小时）
NOTICE_TTL_HOURS = "24"           # 默认 24 小时

# 速率限制（每分钟请求数）
UPLOAD_FILE_RPM = "10"            # 上传文件限制
UPLOAD_TEXT_RPM = "20"            # 上传文本限制
VERIFY_PERM_RPM = "20"            # 验证密码限制
GET_INFO_RPM = "120"              # 获取信息限制
DOWNLOAD_RPM = "60"               # 下载限制
```

### 自动清理任务

系统会自动清理过期文件，清理频率在 `wrangler.toml` 中配置：

```toml
[triggers]
crons = ["*/5 * * * *"]  # 每5分钟运行一次
```

可以修改为其他 Cron 表达式，例如：
- `0 * * * *` - 每小时运行一次
- `0 0 * * *` - 每天凌晨运行一次

## 🔧 本地开发

### 安装依赖
```bash
npm install
```

### 本地运行
```bash
npm run dev
```

### 部署到 Cloudflare
```bash
npm run deploy
```

## 📝 使用说明

### 发送文件
1. 选择"发文件"标签
2. 上传文件或输入文本
3. 设置过期时间
4. 点击"生成提取码"
5. 保存6位数字提取码

### 接收文件
1. 选择"取文件"标签
2. 输入6位数字提取码
3. 查看或下载文件

### 永久保存
- 选择"永久"选项需要输入密码
- 默认密码：`123456`
- 可通过 `PERMANENT_PASSWORD` Secret 自定义

## 🛡️ 安全性

- ✅ 内置速率限制，防止滥用
- ✅ 自动清理过期文件
- ✅ WebDAV 密码通过 Secrets 加密存储
- ✅ 支持自定义永久保存密码
- ⚠️ 建议定期更换 API Token 和密码

## 🐛 常见问题

### 部署失败？
1. 检查 Secrets 是否正确填写
2. 确认 API Token 权限是否足够
3. 查看 GitHub Actions 日志获取详细错误

### WebDAV 连接失败？
1. 确认 WebDAV 地址格式正确
2. 测试用户名密码是否正确
3. 检查 WebDAV 服务是否正常运行

### 文件上传失败？
1. 检查文件大小是否超过限制
2. 确认 WebDAV 存储空间是否充足
3. 查看浏览器控制台错误信息

### KV 命名空间创建失败？
- 部署会自动创建 KV 命名空间
- 如果失败，可以手动创建后在 `wrangler.toml` 中填写 ID

## 📄 许可证

MIT License

## 🙏 致谢

- [Hono](https://hono.dev/) - Web 框架
- [Cloudflare Workers](https://workers.cloudflare.com/) - 边缘计算平台
- [FileCodeBox](https://github.com/vastsa/FileCodeBox) - 原始项目灵感

## 📮 反馈与贡献

欢迎提交 Issue 和 Pull Request！

---

**注意事项：**
- 请遵守当地法律法规，不要上传违法内容
- 建议定期备份重要文件
- 免费版 Cloudflare Workers 有请求限制，请合理使用
