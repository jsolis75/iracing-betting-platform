using System;
using System.IO.MemoryMappedFiles;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace iRacingBroadcaster
{
    class Program
    {
        private const string API_URL = "https://iracing-betting-platform.vercel.app/api/telemetry/ingest";
        private const string API_KEY = "iracing-broadcast-key-123";
        private const string IRACING_MMF_NAME = "Local\\IRSDKMemMapFileName";
        
        private static readonly HttpClient httpClient = new();

        static async Task Main(string[] args)
        {
            Console.Title = "iRacing Telemetry Broadcaster";
            Console.ForegroundColor = ConsoleColor.Green;
            
            Console.WriteLine("========================================================");
            Console.WriteLine("       iRacing Betting Platform - Broadcaster");
            Console.WriteLine("========================================================");
            Console.WriteLine();
            Console.ResetColor();
            
            Console.WriteLine($"Target: {API_URL}");
            Console.WriteLine("--------------------------------");
            Console.WriteLine("Waiting for iRacing to connect...");
            Console.WriteLine("(Make sure you are in a session, not just the UI)");
            Console.WriteLine();

            int attemptCount = 0;
            bool wasConnected = false;

            while (true)
            {
                try
                {
                    // Try to open iRacing's memory mapped file
                    using var mmf = MemoryMappedFile.OpenExisting(IRACING_MMF_NAME);
                    using var accessor = mmf.CreateViewAccessor();

                    if (!wasConnected)
                    {
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine("Connected to iRacing! Broadcasting data...");
                        Console.ResetColor();
                        wasConnected = true;
                    }

                    // Read iRacing header
                    IRacingHeader header = new();
                    accessor.Read(0, out header);

                    // Read YAML data (session info)
                    byte[] yamlBytes = new byte[header.SessionInfoLen];
                    accessor.ReadArray(header.SessionInfoOffset, yamlBytes, 0, yamlBytes.Length);
                    string sessionYaml = Encoding.UTF8.GetString(yamlBytes).TrimEnd('\0');

                    // Read some telemetry values
                    int sessionFlags = ReadTelemetryInt(accessor, header, "SessionFlags");
                    int sessionState = ReadTelemetryInt(accessor, header, "SessionState");
                    int sessionLapsRemain = ReadTelemetryInt(accessor, header, "SessionLapsRemain");
                    double sessionTimeRemain = ReadTelemetryDouble(accessor, header, "SessionTimeRemain");

                    // Build payload
                    var payload = new
                    {
                        SessionInfo = ParseYamlSection(sessionYaml),
                        Telemetry = new
                        {
                            SessionFlags = sessionFlags,
                            SessionState = sessionState,
                            SessionLapsRemain = sessionLapsRemain,
                            SessionTimeRemain = sessionTimeRemain
                        },
                        BroadcastTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                    };

                    // Send to API
                    var json = JsonSerializer.Serialize(payload);
                    var content = new StringContent(json, Encoding.UTF8, "application/json");
                    content.Headers.Add("x-api-key", API_KEY);

                    var response = await httpClient.PostAsync(API_URL, content);

                    if (response.IsSuccessStatusCode)
                    {
                        var time = DateTime.Now.ToString("HH:mm:ss");
                        Console.Write($"\rSent update: {time} | Flags: {sessionFlags}        ");
                    }
                    else
                    {
                        Console.WriteLine();
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine($"API Error {(int)response.StatusCode}");
                        Console.ResetColor();
                    }

                    await Task.Delay(5000); // 5 second interval
                }
                catch (FileNotFoundException)
                {
                    // iRacing not running
                    attemptCount++;
                    if (attemptCount % 5 == 0)
                    {
                        Console.Write($"\rWaiting for iRacing... ({attemptCount}s)    ");
                    }
                    wasConnected = false;
                    await Task.Delay(1000);
                }
                catch (Exception ex)
                {
                    Console.WriteLine();
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"Error: {ex.Message}");
                    Console.ResetColor();
                    await Task.Delay(5000);
                }
            }
        }

        private static int ReadTelemetryInt(MemoryMappedViewAccessor accessor, IRacingHeader header, string varName)
        {
            // Find variable in var headers
            for (int i = 0; i < header.NumVars; i++)
            {
                VarHeader varHeader = new();
                accessor.Read(header.VarHeaderOffset + i * Marshal.SizeOf<VarHeader>(), out varHeader);
                
                string name = Encoding.ASCII.GetString(varHeader.Name).TrimEnd('\0');
                if (name == varName && varHeader.Type == 1) // Type 1 = int
                {
                    int value = 0;
                    accessor.Read(header.VarBuf[0].BufOffset + varHeader.Offset, out value);
                    return value;
                }
            }
            return 0;
        }

        private static double ReadTelemetryDouble(MemoryMappedViewAccessor accessor, IRacingHeader header, string varName)
        {
            for (int i = 0; i < header.NumVars; i++)
            {
                VarHeader varHeader = new();
                accessor.Read(header.VarHeaderOffset + i * Marshal.SizeOf<VarHeader>(), out varHeader);
                
                string name = Encoding.ASCII.GetString(varHeader.Name).TrimEnd('\0');
                if (name == varName && varHeader.Type == 2) // Type 2 = double
                {
                    double value = 0;
                    accessor.Read(header.VarBuf[0].BufOffset + varHeader.Offset, out value);
                    return value;
                }
            }
            return 0.0;
        }

        private static object ParseYamlSection(string yaml)
        {
            // Simple YAML parsing - just return as a string for now
            // The Python version sends the full YAML, so we'll do the same
            return new { RawYAML = yaml };
        }
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct IRacingHeader
    {
        public int Ver;
        public int Status;
        public int TickRate;
        public int SessionInfoUpdate;
        public int SessionInfoLen;
        public int SessionInfoOffset;
        public int NumVars;
        public int VarHeaderOffset;
        public int NumBuf;
        public int BufLen;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4)]
        public VarBuf[] VarBuf;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct VarBuf
    {
        public int TickCount;
        public int BufOffset;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1, CharSet = CharSet.Ansi)]
    struct VarHeader
    {
        public int Type;
        public int Offset;
        public int Count;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
        public byte[] Name;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
        public byte[] Desc;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
        public byte[] Unit;
    }
}
