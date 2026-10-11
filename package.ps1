#  一键打包脚本（内嵌 Python 方案）：产出可发给别人的免安装 zip
#  用法: powershell -ExecutionPolicy Bypass -File package.ps1 [-SkipBuild]
#  产物: release\咸鱼蹲物.zip，解压后双击 启动.bat 即用（对方无需安装 Python/Node）

param(
    [switch]$SkipBuild  # 跳过前端构建（已构建过且未改前端时使用）
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot   # 脚本位于 GooFish 根目录
$release = Join-Path $root 'release'
$stage = Join-Path $release '咸鱼蹲物'
$pyVer = '3.13.2'   # 与开发机 Python 小版本一致，保证 site-packages 的编译扩展兼容
$embedZip = Join-Path $release "cache\python-$pyVer-embed-amd64.zip"
$embedUrl = "https://www.python.org/ftp/python/$pyVer/python-$pyVer-embed-amd64.zip"

New-Item -ItemType Directory -Force -Path $release, (Split-Path -Parent $embedZip) | Out-Null

# ---------- 1. 前端构建 ----------
if (-not $SkipBuild) {
    Write-Host '==> 构建前端 (pnpm build)...'
    Push-Location (Join-Path $root 'Ui')
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
    Pop-Location
} elseif (-not (Test-Path (Join-Path $root 'Ui\dist\index.html'))) {
    throw 'Ui\dist 不存在，请先不带 -SkipBuild 运行以构建前端'
}

# ---------- 2. 组装产物目录 ----------
Write-Host '==> 组装产物目录...'
#  重新打包前备份 stage 里的用户数据（任务/商品/配置/凭证），重建后恢复——
#  否则每次打包都会清空用户在产物目录里积累的任务、商品数据和推送配置
$用户数据文件 = @('option.yaml', 'wechat_option.yaml', 'goods_tasks.yaml', 'good_record.json')
$备份目录 = Join-Path $release 'userdata_backup'
$stageServer = Join-Path $stage 'Server'
if (Test-Path (Join-Path $stage 'Server')) {
    New-Item -ItemType Directory -Force -Path $备份目录 | Out-Null
    foreach ($f in $用户数据文件) {
        $旧文件 = Join-Path $stageServer $f
        if (Test-Path $旧文件) { Copy-Item $旧文件 (Join-Path $备份目录 $f) -Force }
    }
}
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# 2.1 内嵌 Python：缓存不存在则下载官方 embeddable 包
if (-not (Test-Path $embedZip)) {
    Write-Host "==> 下载 Python $pyVer embeddable..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $embedUrl -OutFile $embedZip -UseBasicParsing
}
Expand-Archive -Path $embedZip -DestinationPath (Join-Path $stage 'python') -Force

# 2.2 启用 site-packages：embeddable 默认不加载，往 ._pth 追加一行
$pth = Get-ChildItem (Join-Path $stage 'python') -Filter 'python*._pth' | Select-Object -First 1
if (-not $pth) { throw '未找到 python*._pth' }
Add-Content -Path $pth.FullName -Value "Lib\site-packages" -Encoding Ascii

# 2.3 用开发机 pip 把第三方依赖装进产物 site-packages（本机与 embeddable 同为 3.13，pyd 兼容）
Write-Host '==> 安装后端依赖到内嵌 Python...'
pip install --target (Join-Path $stage 'python\Lib\site-packages') -r (Join-Path $root 'Server\requirements.txt') --quiet
if ($LASTEXITCODE -ne 0) { throw '依赖安装失败' }

# 2.4 后端源码与配置（排除开发用 test_ 前缀配置与临时文件；数据文件运行时在 Server 内自动生成）
Write-Host '==> 拷贝后端源码与配置...'
$stageServer = Join-Path $stage 'Server'
New-Item -ItemType Directory -Force -Path $stageServer | Out-Null
Copy-Item (Join-Path $root 'Server\*.py') $stageServer -Force
Remove-Item (Join-Path $stageServer 'test.py') -Force -ErrorAction SilentlyContinue
#  用户数据优先：重新打包时恢复备份的配置/数据文件；首次打包才从开发目录拷贝模板
foreach ($f in $用户数据文件) {
    $备份 = Join-Path $备份目录 $f
    if (Test-Path $备份) {
        Copy-Item $备份 (Join-Path $stageServer $f) -Force
    } elseif ($f -in @('option.yaml', 'wechat_option.yaml')) {
        Copy-Item (Join-Path $root "Server\$f") $stageServer -Force
    }
}

# 2.5 前端构建产物 → web
Write-Host '==> 拷贝前端产物...'
$stageWeb = Join-Path $stage 'web'
New-Item -ItemType Directory -Force -Path $stageWeb | Out-Null
Copy-Item (Join-Path $root 'Ui\dist\*') $stageWeb -Recurse -Force

# ---------- 3. 生成 启动.bat（内容全英文，规避 PS5 bat 中文编码坑） ----------
$bat = @"
@echo off
cd /d %~dp0
echo ==============================================
echo  GooFish server: http://127.0.0.1:51266/
echo  Keep this window open while using the app.
echo ==============================================
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:51266/"
python\python.exe Server\main.py
pause
"@
# ASCII 编码写入，确保任何系统区域下 bat 都不乱码
[IO.File]::WriteAllText((Join-Path $stage '启动.bat'), ($bat -replace "`n", "`r`n"), [Text.Encoding]::ASCII)

# ---------- 4. 生成 使用说明.txt（UTF-8 BOM，记事本打开不乱码） ----------
$readme = @"
咸鱼蹲物 - 使用说明
====================

启动：双击「启动.bat」，约 3 秒后浏览器自动打开 http://127.0.0.1:51266/
      （黑窗口是服务本体，使用期间请勿关闭；关掉窗口即停止服务）

停止：关闭黑窗口即可。

数据与配置（都在 Server 文件夹内，可随时备份）：
  - goods_tasks.yaml   搜索任务（界面增删改后自动保存）
  - good_record.json   商品数据（自动生成、实时保存）
  - option.yaml        请求配置与端口（server_port 可改监听端口，改后需重启）
  - wechat_option.yaml 微信推送凭证（默认关闭，配置好模板后把 wechat_service 改为 true）

首次使用：无需任何配置，令牌会自动获取；任务请自行新建。

常见问题：
  - 双击后提示端口占用：说明已有实例在运行，端口占用时的强制关闭： for /f "tokens=5" %a in ('netstat -ano ^| findstr :51266') do taskkill /F /PID %a 
	  或改 option.yaml 里的 server_port 为其他端口
  - 通知不弹：浏览器地址栏锁形图标 -> 通知 -> 允许
"@
[IO.File]::WriteAllText((Join-Path $stage '使用说明.txt'), $readme, [Text.UTF8Encoding]::new($true))

# ---------- 5. 压缩为 zip ----------
Write-Host '==> 压缩 zip...'
$zipPath = Join-Path $release '咸鱼蹲物.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $stage -DestinationPath $zipPath -Force

$大小MB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "`n打包完成: $zipPath ($大小MB MB)"
Write-Host "产物目录: $stage"
