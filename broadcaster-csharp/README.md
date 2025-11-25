# iRacing Broadcaster (C#)

A standalone Windows executable that broadcasts iRacing telemetry data to the betting platform.

## Building the Executable

### Prerequisites
1. Install .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0

### Build Instructions

1. Open command prompt in this directory
2. Run the following command to build a standalone executable:

```bash
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:PublishTrimmed=true
```

3. The executable will be located at:
```
bin\Release\net8.0\win-x64\publish\iRacingBroadcaster.exe
```

4. Copy `iRacingBroadcaster.exe` to `public/broadcast/` in the main project

### File Size
The final executable will be approximately 8-12 MB (self-contained, no dependencies required).

## Usage

Users simply download and run `iRacingBroadcaster.exe`. No installation, no Python, no dependencies.

1. Download `iRacingBroadcaster.exe`
2. Double-click to run
3. Start or join an iRacing session
4. The broadcaster will automatically connect and send data

## Notes

- Uses the official iRacing SDK wrapper (NuGet package)
- Self-contained: includes .NET runtime
- Works on Windows 10/11 (64-bit)
- Automatically reconnects if iRacing restarts
