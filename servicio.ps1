# Integrador Faktur como servicio de Windows (subtarea 7.5), opcional. Necesita haber ejecutado instalar.ps1.
#   powershell -ExecutionPolicy Bypass -File servicio.ps1            instala el servicio y lo arranca
#   powershell -ExecutionPolicy Bypass -File servicio.ps1 -Quitar    lo detiene y lo desinstala
# Pide permisos de administrador. Usa WinSW 2.12.0, descargado de GitHub y comprobado por su SHA-256.
# El servicio arranca con el equipo y se reinicia si falla; el acceso directo sigue sirviendo para abrir
# el navegador. Los datos siguen en .\datos.
param(
    [switch]$Quitar,
    [int]$Puerto = 4000,
    [switch]$Elevado
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$idServicio = "IntegradorFaktur"
$dirServicio = Join-Path $PSScriptRoot "servicio"
$exe = Join-Path $dirServicio "$idServicio.exe"
$urlWinSW = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe"
$shaWinSW = "B5066B7BBDFBA1293E5D15CDA3CAAEA88FBEAB35BD5B38C41C913D492AADFC4F"

function Terminar([int]$codigo, [string]$mensaje, [string]$color) {
    Write-Host ""
    Write-Host $mensaje -ForegroundColor $color
    if ($Elevado) { Read-Host "Pulsa Enter para cerrar" | Out-Null }
    exit $codigo
}
function Detener([string]$mensaje) { Terminar 1 $mensaje "Red" }

# Instalar o quitar un servicio exige administrador: se vuelve a lanzar elevado (aviso de UAC).
$identidad = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identidad.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $argumentos = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-Puerto", $Puerto, "-Elevado")
    if ($Quitar) { $argumentos += "-Quitar" }
    try { $p = Start-Process powershell -Verb RunAs -ArgumentList $argumentos -Wait -PassThru }
    catch { Detener "Hace falta aceptar el permiso de administrador para instalar o quitar el servicio." }
    exit $p.ExitCode
}

function Salud {
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$Puerto/health" | Out-Null; return $true }
    catch { return $false }
}

function Quitar-Servicio {
    # Sin depender de WinSW: así se puede quitar aunque alguien haya borrado la carpeta servicio.
    if (-not (Get-Service $idServicio -ErrorAction SilentlyContinue)) { return $false }
    Stop-Service $idServicio -Force -ErrorAction SilentlyContinue
    & sc.exe delete $idServicio | Out-Null
    if ($LASTEXITCODE -ne 0) { Detener "No se pudo desinstalar el servicio." }
    return $true
}

if ($Quitar) {
    if (Quitar-Servicio) {
        Remove-Item $dirServicio -Recurse -Force
        Terminar 0 "Servicio quitado. El integrador vuelve a abrirse con el acceso directo." "Green"
    }
    Terminar 0 "El servicio no estaba instalado." "Yellow"
}

Write-Host "1/4 Comprobando la instalación..."
$node = Join-Path $PSScriptRoot "node\node.exe"
if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $node -or -not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
    Detener "Primero ejecuta instalar.ps1."
}
$version = & $node --version
$mayor = [int]($version.TrimStart("v").Split(".")[0])
if ($mayor -ne 22 -and $mayor -ne 24) { Detener "Node.js $version no es compatible. Ejecuta instalar.ps1." }
Write-Host "    Node.js $version en $node"

$reinstalar = [bool](Get-Service $idServicio -ErrorAction SilentlyContinue)
if ($reinstalar) {
    Write-Host "    El servicio ya existe: se reinstala."
    Quitar-Servicio | Out-Null
}
if (Salud) {
    Detener "El integrador ya está abierto en el puerto $Puerto. Cierra su ventana negra y vuelve a ejecutar este script."
}

Write-Host "2/4 Descargando WinSW..."
New-Item -ItemType Directory -Force $dirServicio | Out-Null
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest -UseBasicParsing $urlWinSW -OutFile $exe
} catch { Detener "No se pudo descargar WinSW. Revisa la conexión a internet.`nDetalle: $($_.Exception.Message)" }
if ((Get-FileHash $exe -Algorithm SHA256).Hash -ne $shaWinSW) {
    Remove-Item $exe -Force
    Detener "El archivo de WinSW descargado no coincide con la versión esperada; no se instala."
}

Write-Host "3/4 Instalando el servicio..."
$x = { param($texto) [Security.SecurityElement]::Escape($texto) }
$xml = @"
<service>
  <id>$idServicio</id>
  <name>Integrador Faktur</name>
  <description>Envía facturas de ContaPyme a Faktur. Interfaz en http://localhost:$Puerto</description>
  <executable>$(& $x $node)</executable>
  <arguments>"$(& $x (Join-Path $PSScriptRoot 'importador_facturas_manual.mjs'))"</arguments>
  <workingdirectory>$(& $x $PSScriptRoot)</workingdirectory>
  <env name="PORT" value="$Puerto"/>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <resetfailure>1 hour</resetfailure>
  <logpath>$(& $x (Join-Path $PSScriptRoot 'logs\servicio'))</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
</service>
"@
[IO.File]::WriteAllText((Join-Path $dirServicio "$idServicio.xml"), $xml, (New-Object Text.UTF8Encoding $false))
& $exe install
if ($LASTEXITCODE -ne 0) { Detener "WinSW no pudo instalar el servicio." }

Write-Host "4/4 Arrancando el servicio..."
& $exe start
$listo = $false
for ($i = 0; $i -lt 30 -and -not $listo; $i++) { Start-Sleep -Seconds 1; $listo = Salud }
if (-not $listo) { Detener "El servicio se instaló pero no responde. Revisa logs\servicio." }

Terminar 0 "Listo. El integrador corre como servicio y arranca con el equipo. Ábrelo con el acceso directo o en http://localhost:$Puerto" "Green"
