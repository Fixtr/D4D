Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$ErrorActionPreference='Stop'
[xml]$xaml=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="NU40 IMU 3D" Width="980" Height="740" Background="#101827" Foreground="#EAF1FF" WindowStartupLocation="CenterScreen">
<Grid Margin="28"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
<StackPanel><TextBlock Text="NU40 / IMU LIVE" FontSize="26" FontWeight="Bold"/><TextBlock x:Name="status" Text="Connecting USB..." Margin="0,8,0,0" Foreground="#93B8D8"/><TextBlock x:Name="record" Text="TWIST ONCE: START/END | NOD: YES | SIDEWAYS: NO | connect BLE first" FontSize="18" Margin="0,8,0,0" Foreground="#FFFFFF"/></StackPanel>
<Viewport3D x:Name="view" Grid.Row="1" Margin="0,16"><Viewport3D.Camera><PerspectiveCamera Position="3,-4,5" LookDirection="-3,4,-5" UpDirection="0,0,1" FieldOfView="45"/></Viewport3D.Camera></Viewport3D>
<StackPanel Grid.Row="2"><TextBlock x:Name="angles" FontSize="23" FontFamily="Consolas"/><TextBlock x:Name="accel" Margin="0,10,0,0" FontSize="18" FontFamily="Consolas"/><TextBlock x:Name="gyro" Margin="0,6,0,0" FontSize="18" FontFamily="Consolas"/><TextBlock Text="X: red / Y: green / Z: blue | Acceleration includes gravity | Yaw is relative" Margin="0,12,0,0" Foreground="#93B8D8"/></StackPanel>
<StackPanel Grid.Row="3" Orientation="Horizontal" Margin="0,22,0,0"><Button x:Name="zero" Content="Set current pose as zero" Padding="18,10"/><Button x:Name="calibrate" Content="Calibrate gyro (hold still 2s)" Padding="18,10" Margin="12,0,0,0"/><TextBlock Text="Hold still for the first 2 seconds." VerticalAlignment="Center" Margin="18,0,0,0"/></StackPanel>
</Grid></Window>
'@
$window=[Windows.Markup.XamlReader]::Load([Xml.XmlNodeReader]::new($xaml))
$view=$window.FindName('view'); $status=$window.FindName('status'); $angles=$window.FindName('angles'); $accel=$window.FindName('accel'); $gyro=$window.FindName('gyro')
$record=$window.FindName('record')
$eventLog=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\work\imu-3d-events.log'))
function Add-Box($group,[double]$x,[double]$y,[double]$z,[double]$sx,[double]$sy,[double]$sz,$color) {
 $mesh=[Windows.Media.Media3D.MeshGeometry3D]::new()
 foreach($point in @(@(0,0,0),@(1,0,0),@(1,1,0),@(0,1,0),@(0,0,1),@(1,0,1),@(1,1,1),@(0,1,1))) {
  $mesh.Positions.Add([Windows.Media.Media3D.Point3D]::new($x+($point[0]-.5)*$sx,$y+($point[1]-.5)*$sy,$z+($point[2]-.5)*$sz))
 }
 foreach($index in @(0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,1,2,6,1,6,5,3,0,4,3,4,7)) {$mesh.TriangleIndices.Add($index)}
 $brush=[Windows.Media.SolidColorBrush]::new([Windows.Media.ColorConverter]::ConvertFromString($color))
 $material=[Windows.Media.Media3D.DiffuseMaterial]::new($brush)
 $model=[Windows.Media.Media3D.GeometryModel3D]::new($mesh,$material); $model.BackMaterial=$material; $group.Children.Add($model)
}
$world=[Windows.Media.Media3D.Model3DGroup]::new()
$world.Children.Add([Windows.Media.Media3D.AmbientLight]::new([Windows.Media.ColorConverter]::ConvertFromString('#909090')))
$world.Children.Add([Windows.Media.Media3D.DirectionalLight]::new([Windows.Media.Colors]::White,[Windows.Media.Media3D.Vector3D]::new(-2,3,-5)))
$board=[Windows.Media.Media3D.Model3DGroup]::new()
Add-Box $board 0 0 0 2.4 1.5 .12 '#159D92'
Add-Box $board 0 0 .18 .7 .7 .24 '#243348'
Add-Box $board 0 -.7 .15 .7 .25 .25 '#BAC8D4'
Add-Box $board .8 0 .12 .15 .15 .12 '#FFCC55'
Add-Box $board 1.65 0 0 1.0 .035 .035 '#F87171'
Add-Box $board 0 1.2 0 .035 .9 .035 '#4ADE80'
Add-Box $board 0 0 .75 .035 .035 1.1 '#60A5FA'
$rx=[Windows.Media.Media3D.AxisAngleRotation3D]::new([Windows.Media.Media3D.Vector3D]::new(1,0,0),0)
$ry=[Windows.Media.Media3D.AxisAngleRotation3D]::new([Windows.Media.Media3D.Vector3D]::new(0,1,0),0)
$rz=[Windows.Media.Media3D.AxisAngleRotation3D]::new([Windows.Media.Media3D.Vector3D]::new(0,0,1),0)
$transforms=[Windows.Media.Media3D.Transform3DGroup]::new()
foreach($r in @($rx,$ry,$rz)) {$transforms.Children.Add([Windows.Media.Media3D.RotateTransform3D]::new($r))}
$board.Transform=$transforms; $world.Children.Add($board)
Add-Box $world 0 0 -1.4 4 4 .025 '#233247'
$visual=[Windows.Media.Media3D.ModelVisual3D]::new(); $visual.Content=$world; $view.Children.Add($visual)
$state=@{buffer='';last=0;roll=0.0;pitch=0.0;yaw=0.0;offset=@(0.0,0.0,0.0);bias=@(0.0,0.0,0.0);sum=@(0.0,0.0,0.0);count=0;calibrating=$true;seen=$false;flashUntil=[datetime]::MinValue}
$window.FindName('zero').Add_Click({$state.offset=@($state.roll,$state.pitch,$state.yaw)})
$window.FindName('calibrate').Add_Click({$state.count=0;$state.sum=@(0.0,0.0,0.0);$state.calibrating=$true})
$device=Get-CimInstance Win32_PnPEntity | Where-Object {$_.PNPDeviceID -match 'VID_239A&PID_80AC' -and $_.Name -match '\(COM\d+\)'} | Select-Object -First 1
if(!$device){throw 'NU40 USB port not found'}
$portName=[regex]::Match($device.Name,'COM\d+').Value
$serial=[IO.Ports.SerialPort]::new($portName,115200);$serial.DtrEnable=$true;$serial.Open();$serial.Write('xif')
$captureDir=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\work\motion-capture'))
[IO.Directory]::CreateDirectory($captureDir) | Out-Null
$capturePath=Join-Path $captureDir ('samples-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.csv')
$writer=[IO.StreamWriter]::new($capturePath,$false,[Text.UTF8Encoding]::new($false));$writer.AutoFlush=$true
$writer.WriteLine('host_time,board_ms,ax,ay,az,gx,gy,gz')
$record.Text='CAPTURING 20ms / perform motion then tell chat: TWIST / YES / NO'
$timer=[Windows.Threading.DispatcherTimer]::new();$timer.Interval=[TimeSpan]::FromMilliseconds(30)
$timer.Add_Tick({
 try {
  if([datetime]::Now -ge $state.flashUntil){$window.Background=[Windows.Media.BrushConverter]::new().ConvertFromString('#101827')}
  $state.buffer+=$serial.ReadExisting()
  while($state.buffer.Contains("`n")) {
   $end=$state.buffer.IndexOf("`n");$line=$state.buffer.Substring(0,$end).Trim();$state.buffer=$state.buffer.Substring($end+1)
   if($line -match '^(MOTION|RECORD|HAPTIC|ERROR)') { Add-Content -LiteralPath $eventLog -Value ((Get-Date -Format 'HH:mm:ss.fff')+' '+$line) }
   if($line -match '^MOTION DETECTED ([seyn])') {
    $signal=$Matches[1]
    $colors=@{s='#9A7600';e='#9A7600';y='#164DAB';n='#A32232'}
    $labels=@{s='TWIST / START gesture';e='TWIST / END gesture';y='NOD / YES gesture';n='SIDEWAYS / NO gesture'}
    $window.Background=[Windows.Media.BrushConverter]::new().ConvertFromString($colors[$signal])
    $state.flashUntil=[datetime]::Now.AddMilliseconds(600)
    $record.Text=$labels[$signal]+' DETECTED (see BLE event for transmission)'
   } elseif($line -match '^RECORD TX ([seyn]):') {
    $signal=$Matches[1]
    $colors=@{s='#9A7600';e='#9A7600';y='#164DAB';n='#A32232'}
    $labels=@{s='START / BLE s SENT';e='END / BLE e SENT';y='YES / BLE y SENT';n='NO / BLE n SENT'}
    $window.Background=[Windows.Media.BrushConverter]::new().ConvertFromString($colors[$signal])
    $state.flashUntil=[datetime]::Now.AddMilliseconds(450)
    $record.Text=$labels[$signal]
   } elseif($line.StartsWith('MOTION WINDOW ')) {
    $record.Text=$line
   } elseif($line.StartsWith('RECORD RX q:')) {
    $record.Text='QUESTION / NOD ONCE = YES / SIDEWAYS ONCE = NO'
   } elseif($line -match '^RECORD (IGNORED|BLOCKED|ERROR|TIMEOUT|disconnected)') {
    $record.Text+=' | '+$line
   }
   if($line -match '^IMU '){$status.Text="$line | $portName | 100 ms"}
   if($line -notmatch '^t=(\d+) addr=(0x[0-9A-F]+) A\[g\] x=([+\-\d.]+) y=([+\-\d.]+) z=([+\-\d.]+) G\[dps\] x=([+\-\d.]+) y=([+\-\d.]+) z=([+\-\d.]+)$'){continue}
   $t=[long]$Matches[1]; $address=$Matches[2]
   $a=@();$g=@();foreach($n in 3..5){$a += [double]::Parse($Matches[$n],[Globalization.CultureInfo]::InvariantCulture)};foreach($n in 6..8){$g += [double]::Parse($Matches[$n],[Globalization.CultureInfo]::InvariantCulture)}
   $writer.WriteLine(([datetime]::Now.ToString('o')+','+$t+','+(($a+$g | ForEach-Object {$_.ToString([Globalization.CultureInfo]::InvariantCulture)}) -join ',')))
   $dt=if($state.last -gt 0){[Math]::Min(.3,($t-$state.last)/1000.0)}else{.1};$state.last=$t
   $ar=[Math]::Atan2($a[1],$a[2])*180/[Math]::PI;$ap=[Math]::Atan2(-$a[0],[Math]::Sqrt($a[1]*$a[1]+$a[2]*$a[2]))*180/[Math]::PI
   if(!$state.seen){$state.roll=$ar;$state.pitch=$ap;$state.seen=$true}
   if($state.calibrating){
    for($j=0;$j -lt 3;$j++){$state.sum[$j]+=$g[$j]};$state.count++
    $status.Text="Calibrating $($state.count)/20 - hold still"
    if($state.count -ge 20){for($j=0;$j -lt 3;$j++){$state.bias[$j]=$state.sum[$j]/$state.count};$state.calibrating=$false;$state.yaw=0;$state.offset=@($ar,$ap,0)}
   } else {
    $norm=[Math]::Sqrt($a[0]*$a[0]+$a[1]*$a[1]+$a[2]*$a[2]);$alpha=if($norm -gt .8 -and $norm -lt 1.2){.96}else{1.0}
    $state.roll=$alpha*($state.roll+($g[0]-$state.bias[0])*$dt)+(1-$alpha)*$ar
    $state.pitch=$alpha*($state.pitch+($g[1]-$state.bias[1])*$dt)+(1-$alpha)*$ap
    $state.yaw+=($g[2]-$state.bias[2])*$dt
    $status.Text="LIVE / $address / $portName / 100 ms / t=$t"
   }
   $rx.Angle=$state.roll-$state.offset[0];$ry.Angle=$state.pitch-$state.offset[1];$rz.Angle=$state.yaw-$state.offset[2]
   $angles.Text=('Roll {0,7:N1}   Pitch {1,7:N1}   Yaw {2,7:N1} deg' -f $rx.Angle,$ry.Angle,$rz.Angle)
   $accel.Text=('Accel [g]   X {0,7:N3}   Y {1,7:N3}   Z {2,7:N3}' -f $a[0],$a[1],$a[2])
   $gyro.Text=('Gyro [dps]  X {0,7:N2}   Y {1,7:N2}   Z {2,7:N2}' -f $g[0],$g[1],$g[2])
  }
 } catch {$status.Text="Error: $($_.Exception.Message)"; $timer.Stop()}
})
$window.Add_Closed({$timer.Stop();if($serial.IsOpen){$serial.Write('o');$serial.Close()};$serial.Dispose();$writer.Dispose()})
$timer.Start()
[void]$window.ShowDialog()
