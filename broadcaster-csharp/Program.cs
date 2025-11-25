using System;
using System.IO.MemoryMappedFiles;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
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

                    // Read header manually (first 144 bytes)
                    byte[] headerBytes = new byte[144];
                    accessor.ReadArray(0, headerBytes, 0, 144);

                    int sessionInfoLen = BitConverter.ToInt32(headerBytes, 16);
                    int sessionInfoOffset = BitConverter.ToInt32(headerBytes, 20);

                    // Read YAML data (session info)
                    byte[] yamlBytes = new byte[sessionInfoLen];
                    accessor.ReadArray(sessionInfoOffset, yamlBytes, 0, sessionInfoLen);
                    string sessionYaml = Encoding.UTF8.GetString(yamlBytes).TrimEnd('\0');

                    // Build payload - just send the session YAML
                    var payload = new
                    {
                        SessionInfo = new { RawYAML = sessionYaml },
                        Telemetry = new
                        {
                            SessionFlags = 0,  // We'll parse these later if needed
                            SessionState = 0,
                            SessionLapsRemain = 0,
                            SessionTimeRemain = 0.0
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
                        Console.Write($"\rSent update: {time} - OK              ");
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
    }
}

