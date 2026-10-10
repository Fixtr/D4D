$ErrorActionPreference = 'Stop'
$host.UI.RawUI.WindowTitle = 'NU40 IMU - 100ms'
$device = Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPDeviceID -match 'VID_239A&PID_80AC' -and $_.Name -match '\(COM\d+\)' } | Select-Object -First 1
if (!$device) { throw 'NU40 USB port not found. Connect USB and reopen this console.' }
$portName = [regex]::Match($device.Name, 'COM\d+').Value
$serial = [IO.Ports.SerialPort]::new($portName,115200)
$serial.DtrEnable = $true
$serial.ReadTimeout = 1000
try {
  $serial.Open()
  Write-Host "NU40 on $portName | 100ms | acceleration in g, angular speed in deg/s"
  Write-Host 'Vibration paused for clean motion readings. Ctrl+C closes the console.'
  $serial.Write('xi')
  while ($true) {
    try { $line=$serial.ReadLine(); Write-Host $line.TrimEnd() } catch [TimeoutException] { }
  }
} finally {
  if ($serial.IsOpen) { $serial.Write('o'); $serial.Close() }
  $serial.Dispose()
}
