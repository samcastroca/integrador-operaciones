# Instalación del Integrador Faktur (subtarea 7.2). Se ejecuta una sola vez desde la carpeta del integrador:
#   powershell -ExecutionPolicy Bypass -File instalar.ps1
# Comprueba Node.js 22 o 24, instala las dependencias con npm ci y crea el acceso directo en el escritorio.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Detener([string]$mensaje) {
    Write-Host ""
    Write-Host $mensaje -ForegroundColor Red
    exit 1
}

Write-Host "1/3 Comprobando Node.js..."
$version = $null
try { $version = (& node --version) 2>$null } catch { }
if (-not $version) {
    Detener "No se encontró Node.js. Instala la versión LTS (22 o 24) desde https://nodejs.org y vuelve a ejecutar este instalador."
}
$mayor = [int]($version.TrimStart("v").Split(".")[0])
if ($mayor -ne 22 -and $mayor -ne 24) {
    Detener "Node.js $version no es compatible. Instala la versión LTS 22 o 24 desde https://nodejs.org."
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
