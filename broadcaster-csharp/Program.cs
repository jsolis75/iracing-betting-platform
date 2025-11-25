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

                    // Parse YAML into simple structure
                    var parsedData = ParseIRacingYaml(sessionYaml);

                    // Build payload matching the Python broadcaster format
                    var payload = parsedData;

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

        private static object ParseIRacingYaml(string yaml)
        {
            // Simple YAML parser for iRacing data
            var result = new Dictionary<string, object>();

            try
            {
                // Split into sections
                var sections = yaml.Split(new[] { "\n---\n" }, StringSplitOptions.None);
                
                foreach (var section in sections)
                {
                    if (string.IsNullOrWhiteSpace(section)) continue;
                    
                    var lines = section.Split('\n');
                    string? sectionName = null;
                    Dictionary<string, string> sectionData = new();

                    foreach (var line in lines)
                    {
                        var trimmed = line.Trim();
                        if (string.IsNullOrEmpty(trimmed)) continue;

                        if (trimmed.EndsWith(":") && !trimmed.Contains(" "))
                        {
                            sectionName = trimmed.TrimEnd(':');
                        }
                        else if (trimmed.Contains(":") && !string.IsNullOrEmpty(sectionName))
                        {
                            var parts = trimmed.Split(new[] { ':' }, 2);
                            if (parts.Length == 2)
                            {
                                var key = parts[0].Trim();
                                var value = parts[1].Trim();
                                sectionData[key] = value;
                            }
                        }
                    }

                    if (!string.IsNullOrEmpty(sectionName) && sectionData.Count > 0)
                    {
                        result[sectionName] = sectionData;
                    }
                }

                // Add required fields
                result["Telemetry"] = new
                {
                    SessionFlags = 0,
                    SessionState = 0,
                    SessionLapsRemain = 0,
                    SessionTimeRemain = 0.0
                };
                result["BroadcastTime"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            }
            catch
            {
                // If parsing fails, return minimal structure
                result["WeekendInfo"] = new { RawYAML = yaml };
                result["BroadcastTime"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            }

            return result;
        }
    }
}

