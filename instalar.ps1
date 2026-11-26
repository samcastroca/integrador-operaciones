# Instalación del Integrador Faktur (subtarea 7.2). Se ejecuta una sola vez desde la carpeta del integrador:
#   powershell -ExecutionPolicy Bypass -File instalar.ps1
# Usa Node.js 22 o 24 si el equipo lo tiene; si no, descarga Node 24 LTS portátil en .\node (sin permisos de
# administrador ni cambios en el sistema). Después instala las dependencias con npm ci y crea el acceso
# directo en el escritorio.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$dirNode = Join-Path $PSScriptRoot "node"

function Detener([string]$mensaje) {
    Write-Host ""
    Write-Host $mensaje -ForegroundColor Red
    exit 1
}

function Usar-NodePortatil {
    if (Test-Path (Join-Path $dirNode "node.exe")) { $env:Path = "$dirNode;$env:Path" }
}

function Version-Node {
    try { return (& node --version) 2>$null } catch { return $null }
}

function Es-Compatible([string]$version) {
    if (-not $version) { return $false }
    $mayor = [int]($version.TrimStart("v").Split(".")[0])
    return $mayor -eq 22 -or $mayor -eq 24
}

function Instalar-NodePortatil {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = "SilentlyContinue"   # la barra de progreso de PowerShell 5.1 hace lentísima la descarga
    $arquitectura = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "win-arm64" } else { "win-x64" }
    $lts = Invoke-RestMethod "https://nodejs.org/dist/index.json" |
        Where-Object { $_.version -like "v24.*" -and $_.lts } | Select-Object -First 1
    $nombre = "node-$($lts.version)-$arquitectura"
    $base = "https://nodejs.org/dist/$($lts.version)"
    Write-Host "    Descargando $nombre..."
    $zip = Join-Path $env:TEMP "$nombre.zip"
    Invoke-WebRequest "$base/$nombre.zip" -OutFile $zip -UseBasicParsing

    $sumas = Invoke-RestMethod "$base/SHASUMS256.txt"
    $linea = $sumas -split "`n" | Where-Object { $_ -match "\s$([regex]::Escape("$nombre.zip"))\s*$" }
    $esperado = ($linea -split "\s+")[0]
    if (-not $esperado -or (Get-FileHash $zip -Algorithm SHA256).Hash -ne $esperado) {
        Remove-Item $zip -Force
        throw "la firma SHA-256 del archivo descargado no coincide con la publicada en nodejs.org"
    }

    $temporal = Join-Path $env:TEMP "integrador-node"
    if (Test-Path $temporal) { Remove-Item $temporal -Recurse -Force }
    Expand-Archive $zip -DestinationPath $temporal
    if (Test-Path $dirNode) { Remove-Item $dirNode -Recurse -Force }
    Move-Item (Join-Path $temporal $nombre) $dirNode
    Remove-Item $zip, $temporal -Recurse -Force
}

Write-Host "1/3 Comprobando Node.js..."
Usar-NodePortatil
$version = Version-Node
if (-not (Es-Compatible $version)) {
    if ($version) { Write-Host "    Node.js $version no es compatible (hace falta 22 o 24)." }
    else { Write-Host "    No se encontró Node.js." }
    Write-Host "    Se instalará Node.js 24 LTS dentro de la carpeta del integrador."
    try { Instalar-NodePortatil }
    catch { Detener "No se pudo instalar Node.js: $($_.Exception.Message). Revisa la conexión a internet y vuelve a ejecutar el instalador." }
    Usar-NodePortatil
    $version = Version-Node
    if (-not (Es-Compatible $version)) { Detener "No se pudo instalar Node.js en $dirNode." }
}
Write-Host "    Node.js $version"

Write-Host "2/3 Instalando dependencias (npm ci)..."
& npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    Detener "npm ci falló. Revisa la conexión a internet y vuelve a ejecutar el instalador."
}

Write-Host "3/3 Creando el acceso directo en el escritorio..."
$escritorio = [Environment]::GetFolderPath("Desktop")
$ruta = Join-Path $escritorio "Integrador Faktur.lnk"
$shell = New-Object -ComObject WScript.Shell
$acceso = $shell.CreateShortcut($ruta)
$acceso.TargetPath = Join-Path $PSScriptRoot "iniciar.bat"
$acceso.WorkingDirectory = $PSScriptRoot
$acceso.Description = "Integrador Faktur: envía facturas de ContaPyme a Faktur"
$acceso.Save()

Write-Host ""
Write-Host "Listo. Abre el integrador con el acceso directo ""Integrador Faktur"" del escritorio." -ForegroundColor Green
