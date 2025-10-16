import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { v4 as uuidv4 } from 'uuid';

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// 工具函数
function generateCode(length = 6) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}
// WebDAV 辅助函数
function getWebDAVAuth(env) {
  const username = env.WEBDAV_USERNAME || 'baixiao258';
  const password = env.WEBDAV_PASSWORD || '';
  return 'Basic ' + btoa(username + ':' + password);
}

async function webdavUpload(env, fileName, fileStream) {
  let webdavUrl = env.WEBDAV_URL || 'https://zeze.teracloud.jp/dav/';
  
  // 确保使用 HTTPS
  if (webdavUrl.startsWith('http://')) {
    webdavUrl = webdavUrl.replace('http://', 'https://');
  }
  if (!webdavUrl.startsWith('https://') && !webdavUrl.startsWith('http://')) {
    webdavUrl = 'https://' + webdavUrl;
  }
  webdavUrl = webdavUrl.replace(/\/$/, '');
  
  const folderPath = `${webdavUrl}/filecodebox`;
  const filePath = `${folderPath}/${fileName}`;
  
  try {
    // 先尝试创建文件夹（如果不存在）
    try {
      await fetch(folderPath, {
        method: 'MKCOL',
        headers: {
          'Authorization': getWebDAVAuth(env),
        }
      });
      console.log(`📁 Created folder: filecodebox`);
    } catch (folderError) {
      // 文件夹可能已存在，忽略错误
      console.log(`📁 Folder may already exist: filecodebox`);
    }
    
    // 上传文件
    const response = await fetch(filePath, {
      method: 'PUT',
      headers: {
        'Authorization': getWebDAVAuth(env),
      },
      body: fileStream
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ WebDAV upload failed: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`WebDAV upload failed: ${response.status} - ${errorText}`);
    }
    
    console.log(`✅ File uploaded successfully to WebDAV: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('❌ WebDAV upload error:', error);
    throw error;
  }
}
async function webdavDownload(env, fileName) {
  let webdavUrl = env.WEBDAV_URL || 'https://zeze.teracloud.jp/dav/';
  // 确保使用 HTTPS
  if (webdavUrl.startsWith('http://')) {
    webdavUrl = webdavUrl.replace('http://', 'https://');
  }
  if (!webdavUrl.startsWith('https://')) {
    webdavUrl = 'https://' + webdavUrl;
  }
  webdavUrl = webdavUrl.replace(/\/$/, '');
  const filePath = `${webdavUrl}/filecodebox/${fileName}`;
  
  try {
    const response = await fetch(filePath, {
      method: 'GET',
      headers: {
        'Authorization': getWebDAVAuth(env),
      }
    });
    
    if (!response.ok) {
      throw new Error(`WebDAV download failed: ${response.status}`);
    }
    
    return response;
  } catch (error) {
    console.error('WebDAV download error:', error);
    throw error;
  }
}

async function webdavDelete(env, fileName) {
  let webdavUrl = env.WEBDAV_URL || 'https://zeze.teracloud.jp/dav/';
  // 确保使用 HTTPS
  if (webdavUrl.startsWith('http://')) {
    webdavUrl = webdavUrl.replace('http://', 'https://');
  }
  if (!webdavUrl.startsWith('https://')) {
    webdavUrl = 'https://' + webdavUrl;
  }
  webdavUrl = webdavUrl.replace(/\/$/, '');
  const filePath = `${webdavUrl}/filecodebox/${fileName}`;
  
  try {
    const response = await fetch(filePath, {
      method: 'DELETE',
      headers: {
        'Authorization': getWebDAVAuth(env),
      }
    });
    
    if (!response.ok && response.status !== 404) {
      throw new Error(`WebDAV delete failed: ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error('WebDAV delete error:', error);
    throw error;
  }
}


// 基础限流中间件（基于 KV 的滑动窗口桶）
function rateLimit(name, limit, windowSec) {
  return rateLimitWithKey(name, limit, windowSec, (c) => c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown');
}

function rateLimitWithKey(name, limit, windowSec, keyResolver) {
  return async (c, next) => {
    try {
      const who = await Promise.resolve(keyResolver(c));
      const nowBucket = Math.floor(Date.now() / 1000 / windowSec);
      const key = `ratelimit:${name}:${who}:${nowBucket}`;

      const currentStr = await c.env.FILECODEBOX_KV.get(key);
      const current = currentStr ? parseInt(currentStr, 10) : 0;
      if (current >= limit) {
        return c.json({ code: 429, detail: '请求过于频繁，请稍后再试' }, 429);
      }

      await c.env.FILECODEBOX_KV.put(key, String(current + 1), { expirationTtl: windowSec + 10 });
    } catch (_) {
      // 限流失败时不阻断主流程
    }
    await next();
  };
}

function calculateExpireTime(value, style) {
  const now = new Date();
  switch (style) {
    case 'minute':
      return new Date(now.getTime() + value * 60 * 1000);
    case 'hour':
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case 'day':
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    case 'forever':
      return null;
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

// 自动清理过期文件函数
async function cleanupExpiredFiles(env) {
  console.log('🧹 Starting automatic cleanup process...');
  
  try {
    const { keys } = await env.FILECODEBOX_KV.list({ prefix: 'file:' });
    
    if (keys.length === 0) {
      console.log('📝 No files to check');
      return { total: 0, cleaned: 0, errors: 0 };
    }
    
    console.log(`📋 Found ${keys.length} files to check for expiration`);
    
    let totalChecked = 0;
    let cleanedCount = 0;
    let errorCount = 0;
    const now = new Date();
    
    const batchSize = 10;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (key) => {
        try {
          totalChecked++;
          const code = key.name.replace('file:', '');
          
          const fileDataStr = await env.FILECODEBOX_KV.get(key.name);
          if (!fileDataStr) {
            return;
          }
          
          const fileData = JSON.parse(fileDataStr);
          
          if (fileData.expired_at) {
            const expireTime = new Date(fileData.expired_at);
            
            if (expireTime <= now) {
              console.log(`⏰ File ${code} expired, cleaning up...`);
              
              await env.FILECODEBOX_KV.delete(key.name);
              console.log(`🗑️ Deleted KV record: ${code}`);
              
              if (fileData.uuid_file_name) {
  try {
    await webdavDelete(env, fileData.uuid_file_name);
    console.log(`🗑️ Deleted WebDAV file: ${fileData.uuid_file_name}`);
  } catch (webdavError) {
    console.error(`❌ Failed to delete WebDAV file:`, webdavError);
    errorCount++;
  }
}
              
              cleanedCount++;
            }
          }
          
        } catch (error) {
          console.error(`❌ Error processing file:`, error);
          errorCount++;
        }
      }));
    }
    
    const result = {
      total: totalChecked,
      cleaned: cleanedCount,
      errors: errorCount,
      timestamp: now.toISOString()
    };
    
    console.log(`🎉 Cleanup completed: ${JSON.stringify(result)}`);
    return result;
    
  } catch (error) {
    console.error('💥 Fatal error during cleanup:', error);
    return { total: 0, cleaned: 0, errors: 1, error: error.message };
  }
}

// Cron 处理器
async function handleScheduled(event, env, ctx) {
  console.log('🕐 Cron trigger activated at:', new Date().toISOString());
  
  try {
    const result = await cleanupExpiredFiles(env);
    
    const statsKey = `cleanup_stats:${new Date().toISOString().split('T')[0]}`;
    const existingStats = await env.FILECODEBOX_KV.get(statsKey);
    const stats = existingStats ? JSON.parse(existingStats) : { runs: 0, total_cleaned: 0 };
    
    stats.runs += 1;
    stats.total_cleaned += result.cleaned;
    stats.last_run = result.timestamp;
    stats.last_result = result;
    
    await env.FILECODEBOX_KV.put(statsKey, JSON.stringify(stats), {
      expirationTtl: 30 * 24 * 60 * 60
    });
    
  } catch (error) {
    console.error('💥 Cron handler error:', error);
  }
}

// 主页面 HTML
const getIndexHTML = (env) => {
  const parseLimitBytes = (value, defBytes) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) return defBytes;
    return n < 100000 ? n * 1024 * 1024 : n;
  };
  const maxFileBytes = parseLimitBytes(env?.MAX_FILE_SIZE, 90 * 1024 * 1024);
  const maxTextBytes = parseLimitBytes(env?.MAX_TEXT_SIZE, 1 * 1024 * 1024);
  const maxFileMB = Math.round(maxFileBytes / 1024 / 1024);
  const maxTextMB = Math.round(maxTextBytes / 1024 / 1024);
  const qrApi = (env && env.QR_API) || 'https://api.qrserver.com/v1/create-qr-code/';

  let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>文件快递柜 - FileCodeBox</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 2rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            width: 90%;
            position: relative;
        }
        .header { text-align: center; margin-bottom: 2rem; }
        .logo { font-size: 3rem; margin-bottom: 0.5rem; }
        .title { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; }
        .subtitle { color: #6b7280; }
        .tabs {
            display: flex;
            margin-bottom: 2rem;
            background: #f3f4f6;
            border-radius: 12px;
            padding: 0.25rem;
        }
        .tab {
            flex: 1;
            padding: 0.75rem;
            text-align: center;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.2s;
            font-weight: 500;
        }
        .tab.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .form-group { margin-bottom: 1.5rem; }
        .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        .form-group input, .form-group textarea, .form-group select {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 0.9rem;
        }
        .form-group input:focus, .form-group textarea:focus, .form-group select:focus {
            outline: none;
            border-color: #667eea;
        }
        .file-upload {
            border: 2px dashed #d1d5db;
            border-radius: 8px;
            padding: 2rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        .file-upload:hover { border-color: #667eea; background: #f0f4ff; }
        .expire-settings { display: flex; gap: 0.5rem; }
        .btn {
            width: 100%;
            padding: 0.875rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn:hover:not(:disabled) { transform: translateY(-2px); }
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .result {
            margin-top: 1.5rem;
            padding: 1.5rem;
            background: rgba(16, 185, 129, 0.1);
            border-radius: 8px;
            border-left: 4px solid #10b981;
        }
        .code-display {
            font-size: 1.5rem;
            font-weight: 700;
            color: #10b981;
            text-align: center;
            margin: 1rem 0;
            letter-spacing: 2px;
            font-family: monospace;
        }
        .retrieve-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
        .retrieve-form input { 
            flex: 1; 
            font-family: monospace;
            font-size: 1.1rem;
            text-align: center;
            letter-spacing: 2px;
        }
        .retrieve-form button {
            padding: 0.75rem 1.5rem;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
        }
        .file-info {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
        }
        .text-content {
            background: #f3f4f6;
            padding: 1rem;
            border-radius: 8px;
            margin-top: 1rem;
            white-space: pre-wrap;
            font-family: monospace;
        }
        
        /* 记录链接样式 */
        .record-link {
            position: absolute;
            bottom: 1rem;
            right: 1rem;
            font-size: 0.9rem;
            font-weight: 600;
            color: #667eea;
            text-decoration: none;
            cursor: pointer;
            transition: color 0.2s;
        }
        
        /* 发件记录特殊间距 - 更靠近按钮 */
        #upload .record-link {
            bottom: 0.2rem;
        }
        .record-link:hover {
            color: #5a67d8;
            text-decoration: underline;
        }
        
        /* 弹窗样式 */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(5px);
        }
        
        /* 详情弹窗层级更高 */
        .modal.detail-modal {
            z-index: 2000;
        }
        
        .modal.show {
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        .modal-content {
            background: white;
            border-radius: 16px;
            padding: 2rem;
            max-width: 90%;
            max-height: 90%;
            overflow-y: auto;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            position: relative;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        
        .modal-close {
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: #f3f4f6;
            border: none;
            border-radius: 50%;
            width: 2rem;
            height: 2rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            color: #6b7280;
            transition: all 0.2s;
            z-index: 1000;
        }
        
        .modal-close:hover {
            background: #e5e7eb;
            color: #374151;
        }
        
        /* 代码块样式 */
        .code-block {
            background: #e0f2fe;
            border: 1px solid #0891b2;
            border-radius: 8px;
            padding: 1rem;
            margin: 0.5rem 0;
            position: relative;
            font-family: monospace;
            font-size: 0.9rem;
            word-break: break-all;
        }
        
        .copy-btn {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: #0891b2;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 0.25rem 0.5rem;
            cursor: pointer;
            font-size: 0.7rem;
            transition: background 0.2s;
        }
        
        .copy-btn:hover {
            background: #0e7490;
        }
        
        /* 记录列表样式 */
        .record-item {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 0.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .record-info {
            flex: 1;
        }
        
        .record-actions {
            display: flex;
            gap: 0.5rem;
        }
        
        .action-btn {
            background: #f3f4f6;
            border: none;
            border-radius: 6px;
            padding: 0.5rem;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.2s;
        }
        
        .action-btn:hover {
            background: #e5e7eb;
            transform: translateY(-1px);
        }
        
        .action-btn.copy { color: #0891b2; }
        .action-btn.view { color: #7c3aed; }
        .action-btn.delete { color: #dc2626; }
        .action-btn.download { color: #059669; }
        
        /* 上传进度样式 */
        .upload-progress {
            margin-top: 1rem;
            padding: 1rem;
            background: #f8fafc;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            display: none;
        }
        
        .upload-progress.show {
            display: block;
        }
        
        .progress-bar-container {
            width: 100%;
            height: 8px;
            background: #e2e8f0;
            border-radius: 4px;
            overflow: hidden;
            margin: 0.5rem 0;
        }
        
        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 4px;
            transition: width 0.3s ease;
            width: 0%;
        }
        
        .progress-text {
            display: flex;
            justify-content: space-between;
            font-size: 0.8rem;
            color: #64748b;
            margin-top: 0.5rem;
        }
        
        .upload-status {
            font-size: 0.9rem;
            font-weight: 500;
            color: #334155;
            margin-bottom: 0.5rem;
        }
        
        /* 通知样式 */
        .notification {
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: #10b981;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            z-index: 2000;
            animation: slideInRight 0.3s ease;
        }
        
        @keyframes slideInRight {
            from { opacity: 0; transform: translateX(100%); }
            to { opacity: 1; transform: translateX(0); }
        }
        
        /* QR 码样式 */
        .qr-code {
            text-align: center;
            margin: 1rem 0;
        }
        
        .qr-code canvas {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
        }
        
        /* 移动端优化 */
        @media (max-width: 640px) {
            .container { 
                padding: 0.5rem; 
                margin: 0.5rem;
                max-width: 100%;
            }
            .expire-settings { flex-direction: column; }
            .retrieve-form { flex-direction: column; }
            
            .retrieve-form input {
                padding: 0.75rem;
                font-size: 1rem;
                height: auto;
                min-height: 44px;
            }
            
            .retrieve-form button {
                padding: 0.75rem;
                font-size: 1rem;
                min-height: 44px;
            }
            
            .btn { 
                padding: 0.75rem 1.5rem; 
                font-size: 1rem;
                min-height: 44px;
            }
            
            .tab {
                padding: 0.75rem 1rem;
                font-size: 0.9rem;
            }
            
            .form-group input, .form-group textarea, .form-group select {
                padding: 0.75rem;
                font-size: 1rem;
                min-height: 44px;
            }
            
            .file-upload {
                padding: 2rem 1rem;
                min-height: 120px;
                word-wrap: break-word;
                overflow-wrap: break-word;
            }
            
            .file-upload.dragover {
                border-color: #667eea;
                background: rgba(102, 126, 234, 0.1);
            }
            
            .code-block {
                padding: 0.75rem;
                font-size: 0.8rem;
                word-break: break-all;
            }
            
            .copy-btn {
                padding: 0.5rem;
                min-width: 44px;
                min-height: 44px;
            }
            
            .record-item {
                padding: 0.75rem;
                margin-bottom: 0.5rem;
            }
            
            .record-actions {
                gap: 0.5rem;
            }
            
            .record-actions button {
                padding: 0.5rem;
                min-width: 44px;
                min-height: 44px;
            }
            
            .modal-content { 
                margin: 0.5rem; 
                max-width: calc(100% - 1rem);
                max-height: calc(100vh - 1rem);
                overflow-y: auto;
            }
            
            h1 { font-size: 1.5rem; }
            h2 { font-size: 1.25rem; }
            h3 { font-size: 1.1rem; }
            
            .modal-content {
                max-width: 95%;
                padding: 1.5rem;
            }
            
            .record-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 1rem;
            }
            
            .record-actions {
                width: 100%;
                justify-content: space-around;
            }
            
            .record-link {
                position: absolute;
                bottom: 0.5rem;
                right: 0.5rem;
                font-size: 0.85rem;
                font-weight: 700;
                color: #667eea;
                text-decoration: none;
                cursor: pointer;
                transition: color 0.2s;
                z-index: 10;
            }

            /* 移动端：发件页发件记录改为正常文流，避免与控件/按钮重叠 */
            #upload .record-link {
                position: static;
                display: block;
                text-align: right;
                margin-top: 0.75rem; /* 与按钮留出间距 */
            }

            /* 移动端：取件页取件记录同样使用正常文流与间距 */
            #retrieve .record-link {
                position: static;
                display: block;
                text-align: right;
                margin-top: 0.75rem;
            }
        }
        
        /* 桌面端：文件详情弹窗减半宽度 */
        @media (min-width: 1024px) {
            #detailModal .modal-content {
                max-width: 450px !important;
            }
            #successModal .modal-content {
                max-width: 450px !important;
            }
        }

        .file-size-hint {
            font-size: 0.8rem;
            color: #6b7280;
            margin-top: 0.5rem;
            text-align: center;
        }
        
        .code-hint {
            font-size: 0.8rem;
            color: #6b7280;
            text-align: center;
            margin-bottom: 1rem;
        }
        
        .loading-spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 0.5rem;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* 密码输入弹窗样式 */
        .password-modal {
            background: rgba(0, 0, 0, 0.7);
        }
        
        .password-content {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 400px;
            width: 90%;
            text-align: center;
        }
        
        .password-input {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 1rem;
            margin: 1rem 0;
            text-align: center;
            font-family: monospace;
        }
        
        .password-buttons {
            display: flex;
            gap: 0.5rem;
            margin-top: 1rem;
        }
        
        .password-buttons button {
            flex: 1;
            padding: 0.75rem;
            border: none;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .password-buttons .confirm {
            background: #10b981;
            color: white;
        }
        
        .password-buttons .cancel {
            background: #f3f4f6;
            color: #374151;
        }

        /* 首次声明弹窗样式 */
        .notice-modal .modal-content {
            max-width: 640px;
            width: 92%;
            border-radius: 18px;
            padding: 2rem 2rem 1.5rem;
            background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
        }
        .notice-title {
            text-align: center;
            font-size: 1.4rem;
            font-weight: 800;
            color: #111827;
            letter-spacing: 2px;
            margin-bottom: 1rem;
        }
        .notice-body {
            color: #374151;
            line-height: 1.8;
            font-size: 0.98rem;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 1rem 1.25rem;
        }
        .notice-actions {
            display: flex;
            gap: 0.75rem;
            margin-top: 1.25rem;
        }
        .notice-actions .btn-primary {
            flex: 1;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            border: none;
            padding: 0.85rem 1rem;
            border-radius: 10px;
            font-weight: 700;
        }
        .notice-actions .btn-secondary {
            flex: 1;
            background: #f3f4f6;
            color: #374151;
            border: none;
            padding: 0.85rem 1rem;
            border-radius: 10px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">📦</div>
            <h1 class="title">文件快递柜</h1>
            <p class="subtitle">匿名口令分享文本和文件</p>
        </div>
        
        <div class="tabs">
            <div class="tab active" onclick="switchTab('upload')">📤 发文件</div>
            <div class="tab" onclick="switchTab('retrieve')">📥 取文件</div>
        </div>
        
        <div id="upload" class="tab-content active">
            <div class="tabs">
                <div class="tab active" onclick="switchUploadType('file')">文件</div>
                <div class="tab" onclick="switchUploadType('text')">文本</div>
            </div>
            
            <div id="file-upload" class="upload-type active">
                <form id="fileForm">
                    <div class="form-group">
                        <div class="file-upload" id="fileUpload">
                            📁 点击选择文件或拖拽到此处
                            <input type="file" id="fileInput" style="display: none;">
                        </div>
                        <div class="file-size-hint">最大支持 ${maxFileMB}MB 文件上传（文本 ${maxTextMB}MB）</div>
                    </div>
                    
                    <div class="upload-progress" id="uploadProgress">
                        <div class="upload-status" id="uploadStatus">准备上传...</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar" id="progressBar"></div>
                        </div>
                        <div class="progress-text">
                            <span id="progressPercent">0%</span>
                            <span id="progressSpeed">0 KB/s</span>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>⏰ 过期设置（到期自动删除）</label>
                        <div class="expire-settings">
                            <input type="number" id="fileExpireValue" value="1" min="1">
                            <select id="fileExpireStyle">
                                <option value="day">天</option>
                                <option value="hour">小时</option>
                                <option value="minute">分钟</option>
                                <option value="forever">永久 🔒</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" class="btn" id="fileSubmitBtn">生成提取码</button>
                </form>
            </div>
            
            <div id="text-upload" class="upload-type" style="display: none;">
                <form id="textForm">
                    <div class="form-group">
                        <label>分享内容</label>
                        <textarea id="textContent" rows="6" placeholder="输入要分享的文本..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>⏰ 过期设置（到期自动删除）</label>
                        <div class="expire-settings">
                            <input type="number" id="textExpireValue" value="1" min="1">
                            <select id="textExpireStyle">
                                <option value="day">天</option>
                                <option value="hour">小时</option>
                                <option value="minute">分钟</option>
                                <option value="forever">永久 🔒</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" class="btn" id="textSubmitBtn">生成提取码</button>
                </form>
            </div>
            
            <div id="uploadResult" class="result" style="display: none;">
                <h3>分享成功！</h3>
                <div class="code-display" id="shareCode"></div>
                <p>请保存好提取码，文件将在设定时间后自动删除</p>
            </div>
            
            <!-- 发件记录链接 -->
            <a href="#" class="record-link" onclick="showSendRecords()">📋 发件记录</a>
        </div>
        
        <div id="retrieve" class="tab-content">
            <div class="code-hint">请输入 6 位数字提取码</div>
            <div class="retrieve-form">
                <input type="text" id="retrieveCode" placeholder="000000" maxlength="6" pattern="[0-9]*" inputmode="numeric">
                <button onclick="retrieveFile()">获取</button>
            </div>
            <div id="retrieveResult" style="display: none;">
                <div class="file-info">
                    <h3 id="fileName">文件信息</h3>
                    <p id="fileSize"></p>
                    <p id="fileTime"></p>
                    <p id="fileExpire"></p>
                    <button class="btn" id="downloadBtn" style="margin-top: 1rem; display: none;">下载文件</button>
                    <div id="textDisplay" style="display: none;">
                        <h4>文本内容：</h4>
                        <div class="text-content" id="textContentDisplay"></div>
                    </div>
                </div>
            </div>
            
            <!-- 取件记录链接 -->
            <a href="#" class="record-link" onclick="showReceiveRecords()">📋 取件记录</a>
        </div>
    </div>

    <!-- 页面1：上传成功弹窗 -->
    <div id="successModal" class="modal">
        <div class="modal-content" style="max-width: 900px; width: 92%;">
            <button class="modal-close" onclick="closeModal('successModal')">&times;</button>
            <div style="text-align: center;">
                <h2 style="color: #10b981; margin-bottom: 1.5rem;">🎉 分享成功！</h2>
                
                <div id="successFileInfo" style="margin-bottom: 1.5rem;">
                    <h3 id="successFileName">文件信息</h3>
                    <p id="successFileSize" style="color: #6b7280;"></p>
                    <p id="successFileTime" style="color: #6b7280;"></p>
                    <p id="successFileExpire" style="color: #6b7280;"></p>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">点击复制提取码</label>
                    <button class="btn" onclick="copyCode()" style="width: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 1rem; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-size: 1.2rem; letter-spacing: 2px;">
                        <span id="successCode"></span>
                    </button>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">wget 下载命令</label>
                    <button class="btn" onclick="copyWget()" style="width: 100%; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; padding: 0.75rem; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s;">点击复制wget</button>
                </div>
                
                <div class="qr-code" id="qrCode" style="margin-top: 1.5rem;">
                    <img id="qrImg" width="150" height="150" alt="QR Code" style="border: 1px solid #e5e7eb; border-radius: 8px;"/>
                    <p style="font-size: 0.8rem; color: #6b7280; margin-top: 0.5rem;">扫码快速分享</p>
                </div>
                
                <button class="btn" onclick="copyMainShareLink()" style="margin-top: 1rem;">
                    🔗 复制取件链接
                </button>
                <button class="btn" onclick="downloadQRImage()" style="margin-top: 0.75rem; background: #2563eb;">
                    ⬇️ 下载二维码
                </button>
            </div>
        </div>
    </div>

    <!-- 首次访问声明弹窗 -->
    <div id="noticeModal" class="modal notice-modal">
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal('noticeModal')">&times;</button>
            <h2 class="notice-title">声明</h2>
            <div class="notice-body">
                <p>1. 禁止上传涉恐、涉暴、涉政，黄、赌、毒等违法内容，违者后果自行承担。</p>
                <p>2. 本站点没有专人维护，请勿上传涉及个人隐私的文件，违者造成所有损失自行承担。</p>
                <p>3. 祝大家生活愉快！！！</p>
            </div>
            <div class="notice-actions">
                <button class="btn-secondary" onclick="closeModal('noticeModal')">我已知晓</button>
                <button class="btn-primary" onclick="acknowledgeNotice()">同意并继续</button>
            </div>
        </div>
    </div>

    <!-- 页面2：取件详情弹窗 -->
    <div id="detailModal" class="modal detail-modal">
        <div class="modal-content" style="max-width: 900px; width: 92%;">
            <button class="modal-close" onclick="closeModal('detailModal')">&times;</button>
            <div style="text-align: center;">
                <h2 style="margin-bottom: 1.5rem;">📄 文件详情</h2>
                
                <div id="detailFileInfo" style="margin-bottom: 1.5rem;">
                    <h3 id="detailFileName">文件名</h3>
                    <p id="detailFileSize" style="color: #6b7280;"></p>
                    <p id="detailFileTime" style="color: #6b7280;"></p>
                    <p id="detailFileExpire" style="color: #6b7280;"></p>
                </div>

                <!-- 新增：复制提取码按钮 -->
                <div id="detailCodeSection" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">点击复制提取码</label>
                    <button class="btn" onclick="copyDetailCode()" style="width: 100%; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border: none; padding: 0.9rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; letter-spacing: 1px;">
                        <span id="detailCodeDisplay"></span>
                    </button>
                </div>
                
                <div id="detailContent">
                    <button class="btn" id="detailActionBtn" style="margin-top: 1rem;"></button>
                </div>
                
                <!-- 新增：下载链接和二维码区域 -->
                <div id="detailShareArea" style="margin-top: 1.5rem; display: none;">
                    <div style="margin-bottom: 1rem;">
                        <button class="btn" onclick="copyDetailShareLink()" style="width: 100%; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; padding: 0.75rem; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s;">点击复制链接</button>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <button class="btn" onclick="copyDetailWget()" style="width: 100%; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; padding: 0.75rem; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s;">点击复制wget</button>
                    </div>
                    
                    <div class="qr-code" style="text-align: center; margin-top: 1.5rem;">
                        <img id="detailQrImg" width="120" height="120" alt="QR Code" style="border: 1px solid #e5e7eb; border-radius: 8px;"/>
                        <p style="font-size: 0.8rem; color: #6b7280; margin-top: 0.5rem;">扫码快速访问</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 页面3：文本预览弹窗 -->
    <div id="textPreviewModal" class="modal detail-modal">
        <div class="modal-content" style="max-width: 900px; width: 92%;">
            <button class="modal-close" onclick="closeModal('textPreviewModal')">&times;</button>
            <div style="position: relative;">
                <h2 style="margin-bottom: 1.5rem; font-size: 1.1rem; font-weight: 600;">📝 文本预览</h2>
                <button class="copy-btn" onclick="copyPreviewText()" style="position: absolute; top: 0.2rem; right: 4rem; z-index: 10; background: #10b981; color: white; border: none; border-radius: 6px; padding: 0.35rem 0.75rem; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.2s;">📋 复制全部</button>
                
                <div id="previewTextContent" style="
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 1.5rem;
                    white-space: pre-wrap;
                    font-family: 'Courier New', monospace;
                    font-size: 0.9rem;
                    line-height: 1.6;
                    max-height: 400px;
                    overflow-y: auto;
                "></div>
            </div>
        </div>
    </div>

    <!-- 发件记录弹窗 -->
    <div id="sendRecordsModal" class="modal">
        <div class="modal-content" style="max-width: 720px;">
            <button class="modal-close" onclick="closeModal('sendRecordsModal')">&times;</button>
            <h2 style="margin-bottom: 1rem;">📤 发件记录</h2>
            <div id="sendRecordsList">
                <p style="text-align: center; color: #6b7280; padding: 2rem;">暂无发件记录</p>
            </div>
        </div>
    </div>

    <!-- 取件记录弹窗 -->
    <div id="receiveRecordsModal" class="modal">
        <div class="modal-content" style="max-width: 720px;">
            <button class="modal-close" onclick="closeModal('receiveRecordsModal')">&times;</button>
            <h2 style="margin-bottom: 1rem;">📥 取件记录</h2>
            <div id="receiveRecordsList">
                <p style="text-align: center; color: #6b7280; padding: 2rem;">暂无取件记录</p>
            </div>
        </div>
    </div>

    <!-- 永久选项密码弹窗 -->
    <div id="passwordModal" class="modal password-modal">
        <div class="password-content">
            <h3 style="margin-bottom: 1rem;">🔒 永久保存需要密码</h3>
            <p style="color: #6b7280; font-size: 0.9rem; margin-bottom: 1rem;">永久保存功能需要验证密码</p>
            <input type="password" id="permanentPassword" class="password-input" placeholder="请输入密码">
            <div class="password-buttons">
                <button class="cancel" onclick="cancelPermanent()">取消</button>
                <button class="confirm" onclick="confirmPermanent()">确认</button>
            </div>
        </div>
    </div>


    <script>
        window.APP_CONFIG = {
            MAX_FILE_SIZE_BYTES: ${maxFileBytes},
            MAX_TEXT_SIZE_BYTES: ${maxTextBytes},
            QR_API: '${qrApi}'
        };
        let currentFileData = null;
        let uploadStartTime = 0;
        let currentUploadType = 'file';
        let pendingPermanentSelect = null;
        
        // 本地存储管理
        const LocalStorage = {
            getSendRecords() {
                const records = localStorage.getItem('filecodebox_send_records');
                return records ? JSON.parse(records) : [];
            },
            
            addSendRecord(record) {
                const records = this.getSendRecords();
                record.id = Date.now().toString();
                record.timestamp = new Date().toISOString();
                records.unshift(record);
                
                if (records.length > 50) {
                    records.splice(50);
                }
                
                localStorage.setItem('filecodebox_send_records', JSON.stringify(records));
                this.cleanupOldRecords('send');
            },
            
            getReceiveRecords() {
                const records = localStorage.getItem('filecodebox_receive_records');
                return records ? JSON.parse(records) : [];
            },
            
            addReceiveRecord(record) {
                const records = this.getReceiveRecords();
                record.id = Date.now().toString();
                record.timestamp = new Date().toISOString();
                records.unshift(record);
                
                if (records.length > 50) {
                    records.splice(50);
                }
                
                localStorage.setItem('filecodebox_receive_records', JSON.stringify(records));
                this.cleanupOldRecords('receive');
            },
            
            deleteSendRecord(id) {
                const records = this.getSendRecords();
                const filtered = records.filter(r => r.id !== id);
                localStorage.setItem('filecodebox_send_records', JSON.stringify(filtered));
            },
            
            deleteReceiveRecord(id) {
                const records = this.getReceiveRecords();
                const filtered = records.filter(r => r.id !== id);
                localStorage.setItem('filecodebox_receive_records', JSON.stringify(filtered));
            },
            
            cleanupOldRecords(type) {
                const key = type === 'send' ? 'filecodebox_send_records' : 'filecodebox_receive_records';
                const records = JSON.parse(localStorage.getItem(key) || '[]');
                const now = new Date();
                const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                
                const filtered = records.filter(record => {
                    return new Date(record.timestamp) > oneDayAgo;
                });
                
                localStorage.setItem(key, JSON.stringify(filtered));
            }
        };
        
        function switchTab(tab) {
            document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById(tab).classList.add('active');
        }
        
        function switchUploadType(type) {
            document.querySelectorAll('#upload .tabs .tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.upload-type').forEach(t => t.style.display = 'none');
            event.target.classList.add('active');
            document.getElementById(type + '-upload').style.display = 'block';
            currentUploadType = type;
            hideUploadProgress();
        }
        
        document.getElementById('fileExpireStyle').addEventListener('change', (e) => {
            if (e.target.value === 'forever') {
                pendingPermanentSelect = e.target;
                showModal('passwordModal');
                e.target.value = 'day';
            }
        });
        
        document.getElementById('textExpireStyle').addEventListener('change', (e) => {
            if (e.target.value === 'forever') {
                pendingPermanentSelect = e.target;
                showModal('passwordModal');
                e.target.value = 'day';
            }
        });
        
        function cancelPermanent() {
            closeModal('passwordModal');
            pendingPermanentSelect = null;
        }
        
        async function confirmPermanent() {
            const passwordInput = document.getElementById('permanentPassword');
            const password = passwordInput.value;
            const originalSelect = pendingPermanentSelect;
            pendingPermanentSelect = null;

            if (!password) {
                showNotification('请输入密码', 'error');
                return;
            }

            try {
                const response = await fetch('/api/verify-permanent', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ password })
                });
                const result = await response.json();

                if (response.ok && result.detail.valid) {
                    if (originalSelect) {
                        originalSelect.value = 'forever';
                    }
                    closeModal('passwordModal');
                    passwordInput.value = '';
                    showNotification('✅ 永久保存已启用', 'success');
                } else {
                    showNotification(result.detail.message || '❌ 密码错误', 'error');
                }
            } catch (error) {
                showNotification('❌ 验证请求失败', 'error');
            }
        }
        
        const fileUpload = document.getElementById('fileUpload');
        const fileInput = document.getElementById('fileInput');
        
        fileUpload.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                if (file.size > (window.APP_CONFIG?.MAX_FILE_SIZE_BYTES || (90 * 1024 * 1024))) {
                    const limitMB = Math.round((window.APP_CONFIG?.MAX_FILE_SIZE_BYTES || (90 * 1024 * 1024)) / 1024 / 1024);
                    alert('文件大小超过 ' + limitMB + 'MB 限制');
                    return;
                }
                currentFileData = file;
                fileUpload.innerHTML = '📄 <span style="word-wrap: break-word; overflow-wrap: break-word; max-width: 100%; display: inline-block;">' + file.name + '</span><br><small>' + formatFileSize(file.size) + '</small>';
                hideUploadProgress();
            }
        });
        
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        function formatSpeed(bytesPerSecond) {
            return formatFileSize(bytesPerSecond) + '/s';
        }
        
        function showUploadProgress() {
            document.getElementById('uploadProgress').classList.add('show');
        }
        
        function hideUploadProgress() {
            document.getElementById('uploadProgress').classList.remove('show');
            resetProgress();
        }
        
        function updateProgress(percent, status, speed = 0) {
            document.getElementById('progressBar').style.width = percent + '%';
            document.getElementById('progressPercent').textContent = Math.round(percent) + '%';
            document.getElementById('uploadStatus').textContent = status;
            if (speed > 0) {
                document.getElementById('progressSpeed').textContent = formatSpeed(speed);
            }
        }
        
        function resetProgress() {
            updateProgress(0, '准备上传...', 0);
        }
        
        document.getElementById('fileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentFileData) {
                alert('请选择文件');
                return;
            }
            
            const submitBtn = document.getElementById('fileSubmitBtn');
            const originalBtnText = submitBtn.textContent;
            
            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="loading-spinner"></span>上传中...';
                showUploadProgress();
                uploadStartTime = Date.now();
                
                const formData = new FormData();
                formData.append('file', currentFileData);
                formData.append('expire_value', document.getElementById('fileExpireValue').value);
                formData.append('expire_style', document.getElementById('fileExpireStyle').value);
                
                
                const xhr = new XMLHttpRequest();
                
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percent = (e.loaded / e.total) * 100;
                        const elapsed = (Date.now() - uploadStartTime) / 1000;
                        const speed = elapsed > 0 ? e.loaded / elapsed : 0;
                        updateProgress(percent, '正在上传文件...', speed);
                    }
                });
                
                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        updateProgress(100, '上传完成！', 0);
                        
                        try {
                            const result = JSON.parse(xhr.responseText);
                            if (result.code === 200) {
                                const code = result.detail.code || result.detail;
                                
                                LocalStorage.addSendRecord({
                                    code: code,
                                    fileName: currentFileData.name,
                                    fileSize: currentFileData.size,
                                    type: 'file',
                                    expireValue: document.getElementById('fileExpireValue').value,
                                    expireStyle: document.getElementById('fileExpireStyle').value
                                });
                                
                                showSuccessModal(code, currentFileData.name, currentFileData.size, 'file');
                                
                                const shareLink = \`\${window.location.origin}/?code=\${code}\`;
                                copyToClipboard(shareLink);
                                showNotification('✅ 取件链接已复制到剪贴板', 'success');
                                
                                hideUploadProgress();
                            } else {
                                alert(result.detail || '上传失败');
                                hideUploadProgress();
                            }
                        } catch (parseError) {
                            alert('服务器响应格式错误');
                            hideUploadProgress();
                        }
                    } else {
                        alert('上传失败，状态码：' + xhr.status);
                        hideUploadProgress();
                    }
                });
                
                xhr.addEventListener('error', () => {
                    alert('网络错误，上传失败');
                    hideUploadProgress();
                });
                
                xhr.open('POST', '/api/share/file');
                // 不设置 Content-Type，让浏览器自动设置 multipart/form-data
                xhr.send(formData);
                
            } catch (error) {
                alert('上传过程中发生错误');
                hideUploadProgress();
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        });
        
        document.getElementById('textForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = document.getElementById('textContent').value.trim();
            if (!text) {
                alert('请输入文本内容');
                return;
            }
            
            const submitBtn = document.getElementById('textSubmitBtn');
            const originalBtnText = submitBtn.textContent;
            
            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="loading-spinner"></span>处理中...';
                
                const formData = new FormData();
                formData.append('text', text);
                formData.append('expire_value', document.getElementById('textExpireValue').value);
                formData.append('expire_style', document.getElementById('textExpireStyle').value);
                
                
                const response = await fetch('/api/share/text', {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                
                if (response.ok && result.code === 200) {
                    const code = result.detail.code || result.detail;
                    
                    LocalStorage.addSendRecord({
                        code: code,
                        fileName: '文本分享',
                        fileSize: text.length,
                        type: 'text',
                        content: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                        expireValue: document.getElementById('textExpireValue').value,
                        expireStyle: document.getElementById('textExpireStyle').value
                    });
                    
                    showSuccessModal(code, '文本分享', text.length, 'text');
                    
                    const shareLink = \`\${window.location.origin}/?code=\${code}\`;
                    copyToClipboard(shareLink);
                    showNotification('✅ 取件链接已复制到剪贴板', 'success');
                    
                } else {
                    alert(result.detail || '分享失败');
                }
            } catch (error) {
                alert('网络错误');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        });
        
        function calculateExpireTime(value, style) {
            const now = new Date();
            switch (style) {
                case 'minute':
                    return new Date(now.getTime() + value * 60 * 1000);
                case 'hour':
                    return new Date(now.getTime() + value * 60 * 60 * 1000);
                case 'day':
                    return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
                case 'forever':
                    return null;
                default:
                    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
            }
        }
        
        function showSuccessModal(code, fileName, fileSize, type) {
            document.getElementById('successCode').textContent = code;
            document.getElementById('successFileName').textContent = fileName;
            document.getElementById('successFileSize').textContent = formatFileSize(fileSize);
            document.getElementById('successFileTime').textContent = '创建时间：' + new Date().toLocaleString();
            
            // 显示过期时间
            const expireValue = type === 'file' ? 
                document.getElementById('fileExpireValue').value : 
                document.getElementById('textExpireValue').value;
            const expireStyle = type === 'file' ? 
                document.getElementById('fileExpireStyle').value : 
                document.getElementById('textExpireStyle').value;
            
            let expireText = '';
            if (expireStyle === 'forever') {
                expireText = '过期设置：永久保存';
            } else {
                const expireDate = calculateExpireTime(parseInt(expireValue), expireStyle);
                expireText = '过期时间：' + expireDate.toLocaleString();
            }
            document.getElementById('successFileExpire').textContent = expireText;
            
            const qrUrl = \`\${window.location.origin}/?code=\${code}\`;
            generateQRCode(qrUrl);
            
            showModal('successModal');
        }
        
        function generateQRCode(text) {
            const img = document.getElementById('qrImg');
            const base = (window.APP_CONFIG && window.APP_CONFIG.QR_API) || 'https://api.qrserver.com/v1/create-qr-code/';
            const url = base + '?size=150x150&margin=2&data=' + encodeURIComponent(text);
            img.src = url;
        }

        function downloadQRImage() {
            const img = document.getElementById('qrImg');
            if (!img || !img.src) return;
            const a = document.createElement('a');
            const code = document.getElementById('successCode').textContent || 'code';
            a.href = img.src;
            a.download = 'filecodebox-' + code + '.png';
            a.click();
        }
        
        document.getElementById('retrieveCode').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
        
        async function retrieveFile() {
            const code = document.getElementById('retrieveCode').value.trim();
            if (!code) {
                alert('请输入提取码');
                return;
            }
            
            if (code.length !== 6 || !/^[0-9]{6}$/.test(code)) {
                alert('提取码应为 6 位数字');
                return;
            }
            
            try {
                const response = await fetch('/api/share/' + code);
                const result = await response.json();
                
                if (response.ok && result.code === 200) {
                    const data = result.detail;
                    
                    LocalStorage.addReceiveRecord({
                        code: code,
                        fileName: data.prefix + data.suffix || '文本分享',
                        fileSize: data.size,
                        type: data.text ? 'text' : 'file',
                        content: data.text ? data.text.substring(0, 100) + (data.text.length > 100 ? '...' : '') : null
                    });
                    
                    // 如果是文本内容，直接显示文本预览弹窗
                    if (data.text) {
                        showTextPreview(data.text);
                    } else {
                        showDetailModal(data, code);
                    }
                    
                    // 成功后清空输入框
                    document.getElementById('retrieveCode').value = '';
                } else {
                    alert(result.detail || '获取失败');
                }
            } catch (error) {
                alert('网络错误');
            }
        }
        
        function showDetailModal(data, code) {
            document.getElementById('detailFileName').textContent = data.prefix + data.suffix || '文本分享';
            document.getElementById('detailFileSize').textContent = data.size ? formatFileSize(data.size) : '';
            document.getElementById('detailFileTime').textContent = '创建时间：' + new Date(data.created_at).toLocaleString();
            
            // 显示过期时间
            let expireText = '';
            if (data.expired_count > 0) {
                expireText = '过期设置：使用 ' + data.expired_count + ' 次后自动删除（已使用 ' + data.used_count + ' 次）';
            } else if (data.expired_at) {
                const expireDate = new Date(data.expired_at);
                expireText = '过期时间：' + expireDate.toLocaleString();
            } else {
                expireText = '过期设置：永久保存';
            }
            document.getElementById('detailFileExpire').textContent = expireText;
            
            const actionBtn = document.getElementById('detailActionBtn');
            const shareArea = document.getElementById('detailShareArea');
            const codeDisplay = document.getElementById('detailCodeDisplay');
            if (codeDisplay) codeDisplay.textContent = code;
            
            if (data.text) {
                actionBtn.textContent = '👁️ 预览内容';
                actionBtn.style.background = '#7c3aed';
                actionBtn.onclick = () => showTextPreview(data.text);
            } else {
                actionBtn.textContent = '⬇️ 点击下载';
                actionBtn.style.background = '#0891b2';
                actionBtn.onclick = () => {
                    window.open('/api/share/' + code + '/download', '_blank');
                };
            }
            
            // 显示分享区域并生成链接和二维码
            shareArea.style.display = 'block';
            const shareLink = window.location.origin + '/?code=' + code;
            
            // 保存提取码到隐藏元素中
            const hiddenCodeElement = document.getElementById('detailHiddenCode');
            if (hiddenCodeElement) {
                hiddenCodeElement.textContent = code;
            } else {
                // 创建隐藏元素保存提取码
                const hiddenElement = document.createElement('span');
                hiddenElement.id = 'detailHiddenCode';
                hiddenElement.style.display = 'none';
                hiddenElement.textContent = code;
                shareArea.appendChild(hiddenElement);
            }
            
            // 生成二维码
            const qrImg = document.getElementById('detailQrImg');
            const base = (window.APP_CONFIG && window.APP_CONFIG.QR_API) || 'https://api.qrserver.com/v1/create-qr-code/';
            qrImg.src = base + '?size=120x120&margin=2&data=' + encodeURIComponent(shareLink);
            
            showModal('detailModal');
        }

        function copyDetailCode() {
            const display = document.getElementById('detailCodeDisplay');
            if (!display) return;
            copyToClipboard(display.textContent);
            showNotification('✅ 提取码已复制', 'success');
        }
        
        function showTextPreview(text) {
            document.getElementById('previewTextContent').textContent = text;
            showModal('textPreviewModal');
        }
        
        function showSendRecords() {
            LocalStorage.cleanupOldRecords('send');
            const records = LocalStorage.getSendRecords();
            const container = document.getElementById('sendRecordsList');
            
            if (records.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">暂无发件记录</p>';
            } else {
                container.innerHTML = records.map(record => \`
                    <div class="record-item">
                        <div class="record-info">
                            <div style="font-weight: 500;">\${record.fileName}</div>
                            <div style="font-size: 0.8rem; color: #6b7280;">
                                \${formatFileSize(record.fileSize)} • \${new Date(record.timestamp).toLocaleString()}
                            </div>
                        </div>
                        <div class="record-actions">
                            <button class="action-btn copy" onclick="copyRecordShareLink('\${record.code}')" title="复制取件链接">🔗</button>
                            <button class="action-btn view" onclick="viewSendRecord('\${record.code}')" title="预览">👁️</button>
                            <button class="action-btn delete" onclick="deleteSendRecord('\${record.id}')" title="删除">🗑️</button>
                        </div>
                    </div>
                \`).join('');
            }
            
            showModal('sendRecordsModal');
        }
        
        function showReceiveRecords() {
            LocalStorage.cleanupOldRecords('receive');
            const records = LocalStorage.getReceiveRecords();
            const container = document.getElementById('receiveRecordsList');
            
            if (records.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">暂无取件记录</p>';
            } else {
                container.innerHTML = records.map(record => \`
                    <div class="record-item">
                        <div class="record-info">
                            <div style="font-weight: 500;">\${record.fileName}</div>
                            <div style="font-size: 0.8rem; color: #6b7280;">
                                \${formatFileSize(record.fileSize)} • \${new Date(record.timestamp).toLocaleString()}
                            </div>
                        </div>
                        <div class="record-actions">
                            <button class="action-btn view" onclick="viewReceiveRecord('\${record.code}')" title="预览">👁️</button>
                            <button class="action-btn download" onclick="downloadReceiveRecord('\${record.code}', '\${record.type}', '\${record.fileName}')" title="下载">⬇️</button>
                            <button class="action-btn delete" onclick="deleteReceiveRecord('\${record.id}')" title="删除">🗑️</button>
                        </div>
                    </div>
                \`).join('');
            }
            
            showModal('receiveRecordsModal');
        }
        
        function copyRecordShareLink(code) {
            const link = \`\${window.location.origin}/?code=\${code}\`;
            copyToClipboard(link);
            showNotification('✅ 取件链接已复制', 'success');
        }
        
        function viewSendRecord(code) {
            fetch('/api/share/' + code)
                .then(response => response.json())
                .then(result => {
                    if (result.code === 200) {
                        showDetailModal(result.detail, code);
                    } else {
                        alert('文件可能已过期或不存在');
                    }
                })
                .catch(() => alert('获取文件信息失败'));
        }
        
        function viewReceiveRecord(code) {
            viewSendRecord(code);
        }
        
        function downloadReceiveRecord(code, type, fileName) {
            if (type === 'text') {
                fetch('/api/share/' + code)
                    .then(response => response.json())
                    .then(result => {
                        if (result.code === 200 && result.detail.text) {
                            const blob = new Blob([result.detail.text], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = fileName + '.txt';
                            a.click();
                            URL.revokeObjectURL(url);
                        } else {
                            alert('文本内容获取失败');
                        }
                    })
                    .catch(() => alert('下载失败'));
            } else {
                window.open('/api/share/' + code + '/download', '_blank');
            }
        }
        
        function deleteSendRecord(id) {
            if (confirm('确定要删除这条发件记录吗？')) {
                LocalStorage.deleteSendRecord(id);
                showSendRecords();
                showNotification('✅ 记录已删除', 'success');
            }
        }
        
        function deleteReceiveRecord(id) {
            if (confirm('确定要删除这条取件记录吗？')) {
                LocalStorage.deleteReceiveRecord(id);
                showReceiveRecords();
                showNotification('✅ 记录已删除', 'success');
            }
        }
        
        function showModal(modalId) {
            document.getElementById(modalId).classList.add('show');
            document.body.style.overflow = 'hidden';
        }
        
        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('show');
            document.body.style.overflow = 'auto';
        }
        
        function copyCode() {
            const code = document.getElementById('successCode').textContent;
            copyToClipboard(code);
            showNotification('✅ 提取码已复制', 'success');
        }
        
        function copyWget() {
            const code = document.getElementById('successCode').textContent;
            const name = document.getElementById('successFileName').textContent || 'download';
            // 生成标准的 wget 命令格式
            const wgetCmd = 'wget -O "' + name + '" "' + window.location.origin + '/api/share/' + code + '/download"';
            copyToClipboard(wgetCmd);
            showNotification('✅ wget 命令已复制', 'success');
        }
        
        // 新增：详情弹窗的复制函数
        function copyDetailShareLink() {
            // 从隐藏元素中获取提取码
            const code = document.getElementById('detailHiddenCode').textContent;
            const link = window.location.origin + '/?code=' + code;
            copyToClipboard(link);
            showNotification('✅ 取件链接已复制', 'success');
        }
        
        function copyDetailWget() {
            // 从详情弹窗中获取文件名和提取码
            const fileName = document.getElementById('detailFileName').textContent || 'download';
            const code = document.getElementById('detailHiddenCode').textContent;
            // 生成标准的 wget 命令格式
            const wgetCmd = 'wget -O "' + fileName + '" "' + window.location.origin + '/api/share/' + code + '/download"';
            copyToClipboard(wgetCmd);
            showNotification('✅ wget 命令已复制', 'success');
        }
        
        function copyMainShareLink() {
            const code = document.getElementById('successCode').textContent;
            const link = \`\${window.location.origin}/?code=\${code}\`;
            copyToClipboard(link);
            showNotification('✅ 取件链接已复制', 'success');
        }
        
        function copyPreviewText() {
            const text = document.getElementById('previewTextContent').textContent;
            copyToClipboard(text);
            showNotification('✅ 文本内容已复制', 'success');
        }
        
        async function copyToClipboard(text) {
            try {
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                }
            } catch (error) {
                console.error('Copy failed:', error);
            }
        }
        
        // ========== 首次访问声明逻辑（按 IP 限制，每 24 小时弹一次） ==========
        async function checkNotice() {
            try {
                const res = await fetch('/api/notice/check');
                const result = await res.json();
                if (res.ok && result.code === 200 && result.detail && result.detail.show === true) {
                    showModal('noticeModal');
                }
            } catch (e) {
                // 忽略错误，不影响主流程
            }
        }

        async function acknowledgeNotice() {
            try {
                const res = await fetch('/api/notice/ack', { method: 'POST' });
                // 无论成功失败，都关闭弹窗，避免影响使用
            } catch (e) {}
            closeModal('noticeModal');
        }

        // 页面加载后检查
        document.addEventListener('DOMContentLoaded', () => {
            checkNotice();
        });

        function showNotification(message, type = 'success') {
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = message;
            
            if (type === 'error') {
                notification.style.background = '#dc2626';
            }
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
        
        document.getElementById('retrieveCode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') retrieveFile();
        });
        
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                closeModal(e.target.id);
            }
        });
        
        document.addEventListener('DOMContentLoaded', () => {
            LocalStorage.cleanupOldRecords('send');
            LocalStorage.cleanupOldRecords('receive');
            
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            if (code && /^[0-9]{6}$/.test(code)) {
                document.getElementById('retrieveCode').value = code;
                setTimeout(() => retrieveFile(), 500);
            }
        });

        // 已移除验证码交互
    </script>
</body>
</html>`;
  return html;
};

// API 路由
app.get('/', async (c) => {
  return c.html(getIndexHTML(c.env));
});

// 首次访问声明：检查是否需要弹出（按 IP 每 24 小时一次）
app.get('/api/notice/check', async (c) => {
  try {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || 'unknown';
    const key = `notice:${ip}`;
    const value = await c.env.FILECODEBOX_KV.get(key);
    if (value) {
      return c.json({ code: 200, detail: { show: false } });
    }
    return c.json({ code: 200, detail: { show: true } });
  } catch (e) {
    return c.json({ code: 200, detail: { show: false } });
  }
});

// 首次访问声明：确认后记录 24 小时
app.post('/api/notice/ack', async (c) => {
  try {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || 'unknown';
    const key = `notice:${ip}`;
    const hours = parseInt(c.env.NOTICE_TTL_HOURS || '24', 10);
    const ttl = Number.isFinite(hours) && hours > 0 ? hours * 60 * 60 : 24 * 60 * 60;
    await c.env.FILECODEBOX_KV.put(key, '1', { expirationTtl: ttl });
    return c.json({ code: 200, detail: { ok: true } });
  } catch (e) {
    return c.json({ code: 200, detail: { ok: false } });
  }
});

app.post('/api/share/text', async (c) => {
  try {
    const formData = await c.req.formData();
    const text = formData.get('text');
    const expireValue = parseInt(formData.get('expire_value')) || 1;
    const expireStyle = formData.get('expire_style') || 'day';
    
    if (!text) {
      return c.json({ code: 400, detail: '文本内容不能为空' }, 400);
    }
    
    const maxTextSize = (function(){
      const n = parseInt(c.env.MAX_TEXT_SIZE) || 0;
      if (!n) return 1 * 1024 * 1024;
      return n < 100000 ? n * 1024 * 1024 : n;
    })();
    if (new TextEncoder().encode(text).length > maxTextSize) {
      return c.json({ code: 400, detail: '文本内容过大' }, 400);
    }
    // 已移除验证码校验
    
    const code = generateCode();
    const expiredAt = calculateExpireTime(expireValue, expireStyle);
    const now = new Date();
    
    const fileData = {
      code,
      text,
      size: text.length,
      expired_at: expiredAt ? expiredAt.toISOString() : null,
      expired_count: -1,
      used_count: 0,
      created_at: now.toISOString(),
      prefix: '',
      suffix: '',
      uuid_file_name: null
    };
    
    await c.env.FILECODEBOX_KV.put(`file:${code}`, JSON.stringify(fileData));
    
    console.log(`📝 Created text share: ${code}, expires: ${expiredAt ? expiredAt.toISOString() : 'never'}`);
    
    return c.json({ code: 200, detail: { code } });
  } catch (error) {
    console.error('Text share error:', error);
    return c.json({ code: 500, detail: '服务器错误' }, 500);
  }
});

app.post('/api/share/file', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const expireValue = parseInt(formData.get('expire_value')) || 1;
    const expireStyle = formData.get('expire_style') || 'day';
    
    if (!file) {
      return c.json({ code: 400, detail: '请选择文件' }, 400);
    }
    // 已移除验证码校验
    
    const maxFileSize = (function(){
      const n = parseInt(c.env.MAX_FILE_SIZE) || 0;
      if (!n) return 90 * 1024 * 1024;
      return n < 100000 ? n * 1024 * 1024 : n;
    })();
    if (file.size > maxFileSize) {
      const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(0);
      return c.json({ code: 400, detail: `文件大小超过 ${maxSizeMB}MB 限制` }, 400);
    }
    
    const code = generateCode();
    const expiredAt = calculateExpireTime(expireValue, expireStyle);
    const fileName = file.name || 'unknown';
    const uuidFileName = uuidv4() + '_' + fileName;
    const now = new Date();
    
    console.log(`📁 Starting file upload: ${code}, file: ${fileName}, size: ${file.size}, expires: ${expiredAt ? expiredAt.toISOString() : 'never'}`);
    
    try {
  await webdavUpload(c.env, uuidFileName, file.stream());
  
  console.log(`✅ File uploaded to WebDAV: ${uuidFileName}`);
} catch (webdavError) {
  console.error('❌ WebDAV upload failed:', webdavError);
  return c.json({ code: 500, detail: 'WebDAV 存储上传失败' }, 500);
}
    
    // 规范化文件名：prefix = 基名（不含扩展名），suffix = 扩展名（含点）
    const lastDotIndex = fileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
    const extension = lastDotIndex > 0 ? fileName.slice(lastDotIndex) : '';

    const fileData = {
      code,
      text: null,
      size: file.size,
      expired_at: expiredAt ? expiredAt.toISOString() : null,
      expired_count: -1,
      used_count: 0,
      created_at: now.toISOString(),
      prefix: baseName,
      suffix: extension,
      uuid_file_name: uuidFileName
    };
    
    await c.env.FILECODEBOX_KV.put(`file:${code}`, JSON.stringify(fileData));
    
    console.log(`✅ Created file share: ${code}`);
    
    return c.json({ code: 200, detail: { code } });
  } catch (error) {
    console.error('File share error:', error);
    return c.json({ code: 500, detail: '服务器错误' }, 500);
  }
});

app.get('/api/share/:code', async (c) => {
  try {
    const code = c.req.param('code');
    
    if (!code || !/^[0-9]{6}$/.test(code)) {
      return c.json({ code: 400, detail: '提取码格式错误，应为6位数字' }, 400);
    }
    
    const fileDataStr = await c.env.FILECODEBOX_KV.get(`file:${code}`);
    
    if (!fileDataStr) {
      return c.json({ code: 404, detail: '提取码不存在或已过期' }, 404);
    }
    
    const fileData = JSON.parse(fileDataStr);
    
    if (fileData.expired_at && new Date(fileData.expired_at) < new Date()) {
      return c.json({ code: 404, detail: '文件已过期，正在清理中' }, 404);
    }
    
    fileData.used_count += 1;
    fileData.last_access = new Date().toISOString();
    
    await c.env.FILECODEBOX_KV.put(`file:${code}`, JSON.stringify(fileData));
    
    console.log(`📖 File ${code} accessed, used_count: ${fileData.used_count}`);
    
    return c.json({ code: 200, detail: fileData });
  } catch (error) {
    console.error('Get file info error:', error);
    return c.json({ code: 500, detail: '服务器错误' }, 500);
  }
});

app.get('/api/share/:code/download', async (c) => {
  try {
    const code = c.req.param('code');
    
    if (!code || !/^[0-9]{6}$/.test(code)) {
      return c.json({ code: 400, detail: '提取码格式错误' }, 400);
    }
    
    const fileDataStr = await c.env.FILECODEBOX_KV.get(`file:${code}`);
    
    if (!fileDataStr) {
      return c.json({ code: 404, detail: '提取码不存在或已过期' }, 404);
    }
    
    const fileData = JSON.parse(fileDataStr);
    
    if (!fileData.uuid_file_name) {
      return c.json({ code: 400, detail: '这是文本分享，不支持下载' }, 400);
    }
    
    if (fileData.expired_at && new Date(fileData.expired_at) < new Date()) {
      return c.json({ code: 404, detail: '文件已过期，正在清理中' }, 404);
    }
    
    try {
  const response = await webdavDownload(c.env, fileData.uuid_file_name);
  if (!response || !response.ok) {
    console.error(`❌ WebDAV file not found: ${fileData.uuid_file_name} for code: ${code}`);
    return c.json({ code: 404, detail: '文件不存在' }, 404);
  }
  
  console.log(`📥 File ${code} downloaded: ${fileData.uuid_file_name}`);
  
  const asciiName = `${fileData.prefix}${fileData.suffix}`;
  const disposition = `attachment; filename="${encodeURIComponent(asciiName)}"; filename*=UTF-8''${encodeURIComponent(asciiName)}`;

  return new Response(response.body, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Disposition': disposition,
      'Content-Length': response.headers.get('Content-Length') || '0'
    }
  });
} catch (webdavError) {
  console.error(`❌ WebDAV get error for ${fileData.uuid_file_name}:`, webdavError);
  return c.json({ code: 500, detail: 'WebDAV 存储访问失败' }, 500);
}
  } catch (error) {
    console.error('Download file error:', error);
    return c.json({ code: 500, detail: '服务器错误' }, 500);
  }
});

// 简易验证码：生成与校验
// 已移除验证码端点与校验

// 验证永久密码的端点
app.post('/api/verify-permanent', async (c) => {
  try {
    const { password } = await c.req.json();
    const correctPassword = c.env.PERMANENT_PASSWORD || '123456';
    
    if (password === correctPassword) {
      return c.json({ code: 200, detail: { valid: true } });
    } else {
      return c.json({ code: 400, detail: { valid: false, message: '密码错误' } }, 400);
    }
  } catch (error) {
    return c.json({ code: 500, detail: '验证失败' }, 500);
  }
});

// 将限流应用到关键路由（阈值来自环境变量，提供默认值），每次请求动态读取
function readInt(val, def) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

app.use('/api/share/file', async (c, next) => {
  const lim = readInt(c.env.UPLOAD_FILE_RPM, 10);
  return rateLimit('upload-file', lim, 60)(c, next);
});
app.use('/api/share/text', async (c, next) => {
  const lim = readInt(c.env.UPLOAD_TEXT_RPM, 20);
  return rateLimit('upload-text', lim, 60)(c, next);
});
app.use('/api/verify-permanent', async (c, next) => {
  const lim = readInt(c.env.VERIFY_PERM_RPM, 20);
  return rateLimit('verify-permanent', lim, 60)(c, next);
});
// 基于 IP 的限流之外，再按提取码维度限流
app.use('/api/share/:code', async (c, next) => {
  const lim = readInt(c.env.GET_INFO_RPM, 120);
  return rateLimitWithKey('get-info-code', lim, 60, (_c) => _c.req.param('code'))(c, next);
});
app.use('/api/share/:code/download', async (c, next) => {
  const lim = readInt(c.env.DOWNLOAD_RPM, 60);
  return rateLimitWithKey('download-code', lim, 60, (_c) => _c.req.param('code'))(c, next);
});

export default {
  fetch: app.fetch,
  scheduled: handleScheduled
};
