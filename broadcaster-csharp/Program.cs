using System;
using System.Collections.Generic;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace iRacingBroadcaster
{
    // ============================================================
    //  iRacing Betting Platform - Telemetry Broadcaster (v2)
    //  A faithful C# port of broadcast_telemetry.py (irsdk-based).
    //  Sends parsed WeekendInfo / SessionInfo / DriverInfo + live
    //  telemetry to the website every 5 seconds.
    // ============================================================
    class Program
    {
        private const string DEFAULT_API_URL = "https://iracingbets.com/api/telemetry/ingest";
        private const string DEFAULT_API_KEY = "iracing-broadcast-key-123";
        private const string IRACING_MMF_NAME = "Local\\IRSDKMemMapFileName";
        private const int SEND_INTERVAL_MS = 5000;

        private static string apiUrl = DEFAULT_API_URL;
        private static string apiKey = DEFAULT_API_KEY;

        private static readonly HttpClient httpClient = new() { Timeout = TimeSpan.FromSeconds(10) };

        static async Task<int> Main(string[] args)
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

            // Optional overrides (power users / testing). Normal users just double-click.
            apiUrl = Environment.GetEnvironmentVariable("IRACINGBETS_API_URL") ?? DEFAULT_API_URL;
            apiKey = Environment.GetEnvironmentVariable("IRACINGBETS_API_KEY") ?? DEFAULT_API_KEY;

            // Hidden test mode: parse a session YAML file and print the JSON payload (used for testing).
            for (int a = 0; a < args.Length; a++)
            {
                if (args[a] == "--test-yaml" && a + 1 < args.Length)
                    return TestYamlMode(args[a + 1]);
                if (args[a] == "--url" && a + 1 < args.Length)
                    apiUrl = args[a + 1];
            }

            Console.Title = "iRacingBets.com Broadcaster";
            try { Console.OutputEncoding = Encoding.UTF8; } catch { /* non-interactive console */ }
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("========================================================");
            Console.WriteLine("        iRacingBets.com  -  Telemetry Broadcaster");
            Console.WriteLine("========================================================");
            Console.ResetColor();
            Console.WriteLine();
            Console.WriteLine($"Target: {apiUrl}");
            Console.WriteLine("--------------------------------------------------------");
            Console.WriteLine("Waiting for iRacing to connect...");
            Console.WriteLine("(Make sure you are IN the sim - in the car or spotting -");
            Console.WriteLine(" not just in the iRacing UI)");
            Console.WriteLine();

            if (!OperatingSystem.IsWindows())
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("This broadcaster must run on Windows (where iRacing runs).");
                Console.ResetColor();
                return 1;
            }

            int waitSeconds = 0;
            bool wasConnected = false;

            while (true)
            {
                try
                {
                    using var mmf = MemoryMappedFile.OpenExisting(IRACING_MMF_NAME, MemoryMappedFileRights.Read);
                    using var accessor = mmf.CreateViewAccessor(0, 0, MemoryMappedFileAccess.Read);

                    var sdk = new IRacingSharedMem(accessor);

                    if (!sdk.IsConnected)
                    {
                        // iRacing app is open but the sim session isn't live yet.
                        wasConnected = false;
                        waitSeconds++;
                        if (waitSeconds % 5 == 0)
                            Console.Write($"\r[..] Waiting for an active iRacing session... ({waitSeconds}s)      ");
                        await Task.Delay(1000);
                        continue;
                    }

                    if (!wasConnected)
                    {
                        Console.WriteLine();
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine("[OK] Connected to iRacing! Broadcasting data...");
                        Console.ResetColor();
                        wasConnected = true;
                        waitSeconds = 0;
                    }

                    // ---- Build payload (mirrors broadcast_telemetry.py) ----
                    var payload = sdk.BuildPayload();

                    if (payload == null)
                    {
                        // Session info not readable yet; try again shortly.
                        await Task.Delay(1000);
                        continue;
                    }

                    // ---- Send to API ----
                    await SendPayload(payload);

                    await Task.Delay(SEND_INTERVAL_MS);
                }
                catch (FileNotFoundException)
                {
                    // iRacing is not running (memory-mapped file doesn't exist yet)
                    wasConnected = false;
                    waitSeconds++;
                    if (waitSeconds % 5 == 0)
                        Console.Write($"\r[..] Waiting for iRacing... ({waitSeconds}s)      ");
                    await Task.Delay(1000);
                }
                catch (Exception ex)
                {
                    Console.WriteLine();
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"[X] Error: {ex.Message}");
                    Console.ResetColor();
                    Console.WriteLine("    Retrying in 5 seconds...");
                    wasConnected = false;
                    await Task.Delay(5000);
                }
            }
        }

        private static async Task SendPayload(Dictionary<string, object?> payload)
        {
            try
            {
                var json = JsonUtil.Serialize(payload);
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                using var requestMsg = new HttpRequestMessage(HttpMethod.Post, apiUrl);
                requestMsg.Headers.Add("x-api-key", apiKey);
                requestMsg.Content = content;

                var response = await httpClient.SendAsync(requestMsg);

                if (response.IsSuccessStatusCode)
                {
                    var flags = (payload["Telemetry"] as Dictionary<string, object?>)?["SessionFlags"];
                    Console.Write($"\r[>>] Sent update: {DateTime.Now:HH:mm:ss} | Flags: {flags ?? "n/a"}          ");
                }
                else
                {
                    var body = await response.Content.ReadAsStringAsync();
                    if (body.Length > 300) body = body[..300];
                    Console.WriteLine();
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine($"[!] API Error {(int)response.StatusCode}: {body}");
                    if ((int)response.StatusCode == 401)
                        Console.WriteLine("    (The API key was rejected - make sure you have the latest broadcaster.)");
                    Console.ResetColor();
                }
            }
            catch (TaskCanceledException)
            {
                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[!] Request timed out - check your internet connection. Will keep trying.");
                Console.ResetColor();
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine($"[!] Connection error: {ex.Message}. Will keep trying.");
                Console.ResetColor();
            }
        }

        // ---- Test mode: parse YAML file, print payload JSON ----
        private static int TestYamlMode(string path)
        {
            var bytes = File.ReadAllBytes(path);
            var root = IRacingYaml.ParseSessionInfo(bytes);
            var payload = new Dictionary<string, object?>
            {
                ["WeekendInfo"] = root.TryGetValue("WeekendInfo", out var w) ? w : new Dictionary<string, object?>(),
                ["SessionInfo"] = root.TryGetValue("SessionInfo", out var s) ? s : new Dictionary<string, object?>(),
                ["DriverInfo"] = root.TryGetValue("DriverInfo", out var d) ? d : new Dictionary<string, object?>(),
                ["Telemetry"] = new Dictionary<string, object?>
                {
                    ["SessionFlags"] = 0L,
                    ["SessionState"] = 0L,
                    ["SessionLapsRemain"] = 0L,
                    ["SessionTimeRemain"] = 0.0
                },
                ["BroadcastTime"] = 0.0
            };
            Console.WriteLine(JsonUtil.Serialize(payload));
            return 0;
        }
    }

    // ============================================================
    //  Reads the iRacing shared memory (irsdk memory-mapped file).
    //  Struct layout mirrors pyirsdk (irsdk.py).
    // ============================================================
    class IRacingSharedMem
    {
        private readonly MemoryMappedViewAccessor acc;

        public IRacingSharedMem(MemoryMappedViewAccessor accessor) => acc = accessor;

        // --- Header fields (irsdk_header) ---
        public int Version => acc.ReadInt32(0);
        public int Status => acc.ReadInt32(4);
        public int SessionInfoUpdate => acc.ReadInt32(12);
        public int SessionInfoLen => acc.ReadInt32(16);
        public int SessionInfoOffset => acc.ReadInt32(20);
        public int NumVars => acc.ReadInt32(24);
        public int VarHeaderOffset => acc.ReadInt32(28);
        public int NumBuf => acc.ReadInt32(32);
        public int BufLen => acc.ReadInt32(36);

        public bool IsConnected => (Status & 1) == 1;

        // --- Session info YAML (raw bytes) ---
        public byte[] ReadSessionInfoBytes()
        {
            int len = SessionInfoLen;
            int offset = SessionInfoOffset;
            if (len <= 0 || offset <= 0) return Array.Empty<byte>();
            var buf = new byte[len];
            acc.ReadArray(offset, buf, 0, len);
            return buf;
        }

        // --- Var buffers: pick 2nd-most-recent (same trick as pyirsdk,
        //     avoids reading a buffer that is mid-write) ---
        private int LatestVarBufOffset()
        {
            int numBuf = Math.Min(NumBuf, 4);
            var bufs = new List<(int tick, int offset)>();
            for (int i = 0; i < numBuf; i++)
            {
                int baseOff = 48 + i * 16;
                bufs.Add((acc.ReadInt32(baseOff), acc.ReadInt32(baseOff + 4)));
            }
            if (bufs.Count == 0) return -1;
            bufs.Sort((a, b) => b.tick.CompareTo(a.tick));
            return bufs.Count > 1 ? bufs[1].offset : bufs[0].offset;
        }

        // --- Var headers (144 bytes each) ---
        private Dictionary<string, (int type, int offset, int count)>? varHeaders;

        private Dictionary<string, (int type, int offset, int count)> VarHeaders()
        {
            if (varHeaders != null) return varHeaders;
            varHeaders = new Dictionary<string, (int, int, int)>();
            int n = NumVars;
            int baseOff = VarHeaderOffset;
            var nameBytes = new byte[32];
            for (int i = 0; i < n; i++)
            {
                int off = baseOff + i * 144;
                int type = acc.ReadInt32(off);
                int varOffset = acc.ReadInt32(off + 4);
                int count = acc.ReadInt32(off + 8);
                acc.ReadArray(off + 16, nameBytes, 0, 32);
                string name = Encoding.Latin1.GetString(nameBytes).TrimEnd('\0');
                varHeaders[name] = (type, varOffset, count);
            }
            return varHeaders;
        }

        // Read a single-value telemetry var by name. Types: 0=char 1=bool 2=int 3=bitfield 4=float 5=double
        public object? ReadVar(string name)
        {
            var headers = VarHeaders();
            if (!headers.TryGetValue(name, out var vh)) return null;
            int bufOffset = LatestVarBufOffset();
            if (bufOffset < 0) return null;
            long pos = bufOffset + vh.offset;
            return vh.type switch
            {
                0 => (long)acc.ReadByte(pos),
                1 => acc.ReadBoolean(pos),
                2 => (long)acc.ReadInt32(pos),
                3 => (long)acc.ReadUInt32(pos),
                4 => (double)acc.ReadSingle(pos),
                5 => acc.ReadDouble(pos),
                _ => null
            };
        }

        public Dictionary<string, object?>? BuildPayload()
        {
            var yamlBytes = ReadSessionInfoBytes();
            if (yamlBytes.Length == 0) return null;

            Dictionary<string, object?> root;
            try
            {
                root = IRacingYaml.ParseSessionInfo(yamlBytes);
            }
            catch (Exception ex)
            {
                Console.WriteLine();
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine($"[!] Could not parse session info: {ex.Message}");
                Console.ResetColor();
                return null;
            }

            return new Dictionary<string, object?>
            {
                ["WeekendInfo"] = root.TryGetValue("WeekendInfo", out var w) && w != null ? w : new Dictionary<string, object?>(),
                ["SessionInfo"] = root.TryGetValue("SessionInfo", out var s) && s != null ? s : new Dictionary<string, object?>(),
                ["DriverInfo"] = root.TryGetValue("DriverInfo", out var d) && d != null ? d : new Dictionary<string, object?>(),
                ["Telemetry"] = new Dictionary<string, object?>
                {
                    ["SessionFlags"] = ReadVar("SessionFlags"),
                    ["SessionState"] = ReadVar("SessionState"),
                    ["SessionLapsRemain"] = ReadVar("SessionLapsRemain"),
                    ["SessionTimeRemain"] = ReadVar("SessionTimeRemain")
                },
                ["BroadcastTime"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0
            };
        }
    }

    // ============================================================
    //  Parses iRacing's session-info YAML into plain objects
    //  (Dictionary / List / long / double / bool / string / null),
    //  applying the same pre-processing fixups as pyirsdk.
    // ============================================================
    static class IRacingYaml
    {
        // pyirsdk: YAML_TRANSLATER - replace cp1252-invalid bytes with spaces
        private static readonly byte[] BadBytes = { 0x81, 0x8D, 0x8F, 0x90, 0x9D };

        // pyirsdk: quote free-text name fields so commas/colons don't break parsing
        private static readonly Regex NameFieldRegex = new(
            @"((?:DriverSetupName|UserName|TeamName|AbbrevName|Initials): )(.*)", RegexOptions.Compiled);

        // pyirsdk: quote any value that starts with a comma
        private static readonly Regex CommaValueRegex = new(
            @"(\w+: )(,.*)", RegexOptions.Compiled);

        private static readonly Regex NonPrintableRegex = new(
            @"[^\x09\x0A\x0D\x20-\x7E\x85\xA0-\uD7FF\uE000-\uFFFD]", RegexOptions.Compiled);

        public static Dictionary<string, object?> ParseSessionInfo(byte[] raw)
        {
            // 1. Translate invalid cp1252 bytes to spaces, trim trailing NULs
            int len = raw.Length;
            while (len > 0 && raw[len - 1] == 0) len--;
            for (int i = 0; i < len; i++)
            {
                if (raw[i] == 0x81 || raw[i] == 0x8D || raw[i] == 0x8F || raw[i] == 0x90 || raw[i] == 0x9D)
                    raw[i] = 0x20;
            }

            // 2. Decode as cp1252 (Windows-1252), remove non-printables
            var enc = Encoding.GetEncoding(1252);
            string text = enc.GetString(raw, 0, len);
            text = NonPrintableRegex.Replace(text, "");

            // 3. Apply pyirsdk fixups
            text = NameFieldRegex.Replace(text, m =>
                m.Groups[1].Value + "\"" + m.Groups[2].Value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"");
            text = CommaValueRegex.Replace(text, "$1\"$2\"");

            // 4. Parse block YAML
            var value = MiniYaml.Parse(text);
            if (value is Dictionary<string, object?> map) return map;
            return new Dictionary<string, object?>();
        }
    }

    // ============================================================
    //  Minimal block-style YAML parser - covers the subset iRacing
    //  emits: nested mappings, "- " sequences, plain / quoted
    //  scalars. YAML 1.1 typing for ints, floats, bools, null.
    // ============================================================
    static class MiniYaml
    {
        private struct Line
        {
            public int Indent;
            public string Content;
        }

        public static object? Parse(string text)
        {
            var lines = new List<Line>();
            foreach (var rawLine in text.Split('\n'))
            {
                var lineText = rawLine.TrimEnd('\r');
                if (lineText.Trim().Length == 0) continue;
                var trimmed = lineText.TrimStart(' ');
                if (trimmed == "---" || trimmed == "...") continue;
                lines.Add(new Line { Indent = lineText.Length - trimmed.Length, Content = trimmed.TrimEnd() });
            }
            if (lines.Count == 0) return new Dictionary<string, object?>();
            int i = 0;
            return ParseBlock(lines, ref i, lines[0].Indent);
        }

        private static bool IsDash(in Line l) =>
            l.Content == "-" || l.Content.StartsWith("- ");

        private static object? ParseBlock(List<Line> lines, ref int i, int indent)
        {
            if (i < lines.Count && lines[i].Indent == indent && IsDash(lines[i]))
                return ParseSequence(lines, ref i, indent);
            return ParseMapping(lines, ref i, indent);
        }

        private static List<object?> ParseSequence(List<Line> lines, ref int i, int indent)
        {
            var list = new List<object?>();
            while (i < lines.Count && lines[i].Indent == indent && IsDash(lines[i]))
            {
                string content = lines[i].Content == "-" ? "" : lines[i].Content[2..].TrimStart();
                if (content.Length == 0)
                {
                    // dash alone: nested block on following lines
                    i++;
                    if (i < lines.Count && lines[i].Indent > indent)
                        list.Add(ParseBlock(lines, ref i, lines[i].Indent));
                    else
                        list.Add(null);
                }
                else if (FindKeySep(content) >= 0)
                {
                    // inline mapping starts on the dash line; its keys continue at indent+2
                    lines[i] = new Line { Indent = indent + 2, Content = content };
                    list.Add(ParseMapping(lines, ref i, indent + 2));
                }
                else
                {
                    list.Add(ParseScalar(content));
                    i++;
                }
            }
            return list;
        }

        private static Dictionary<string, object?> ParseMapping(List<Line> lines, ref int i, int indent)
        {
            var map = new Dictionary<string, object?>();
            while (i < lines.Count)
            {
                var line = lines[i];
                if (line.Indent != indent || IsDash(line)) break;

                int sep = FindKeySep(line.Content);
                if (sep < 0) { i++; continue; } // not a key line; skip defensively

                string key = line.Content[..sep].Trim();
                string rest = sep + 1 < line.Content.Length ? line.Content[(sep + 1)..].Trim() : "";
                i++;

                if (rest.Length > 0)
                {
                    map[key] = ParseScalar(rest);
                }
                else if (i < lines.Count &&
                         (lines[i].Indent > indent || (lines[i].Indent == indent && IsDash(lines[i]))))
                {
                    if (lines[i].Indent == indent) // sequence at same indent as its key
                        map[key] = ParseSequence(lines, ref i, indent);
                    else
                        map[key] = ParseBlock(lines, ref i, lines[i].Indent);
                }
                else
                {
                    map[key] = null;
                }
            }
            return map;
        }

        // Index of the ':' that separates key from value ( ':' followed by space or end-of-line ).
        private static int FindKeySep(string s)
        {
            for (int j = 0; j < s.Length; j++)
            {
                if (s[j] == ':' && (j + 1 == s.Length || s[j + 1] == ' '))
                    return j;
                // keys are simple words; if we hit a quote before a colon, this isn't a key line
                if (s[j] == '"' || s[j] == '\'') return -1;
            }
            return -1;
        }

        private static readonly Regex IntRegex = new(@"^[-+]?(0|[1-9][0-9]*)$", RegexOptions.Compiled);
        private static readonly Regex FloatRegex = new(@"^[-+]?([0-9]+\.[0-9]*|\.[0-9]+|[0-9]+)([eE][-+]?[0-9]+)?$", RegexOptions.Compiled);

        private static object? ParseScalar(string s)
        {
            if (s.Length == 0) return null;

            // Quoted strings
            if (s.Length >= 2 && s[0] == '"' && s[^1] == '"')
                return s[1..^1].Replace("\\\"", "\"").Replace("\\\\", "\\");
            if (s.Length >= 2 && s[0] == '\'' && s[^1] == '\'')
                return s[1..^1].Replace("''", "'");

            // Null
            if (s is "~" or "null" or "Null" or "NULL") return null;

            // Booleans (YAML 1.1, matching PyYAML SafeLoader)
            switch (s)
            {
                case "true": case "True": case "TRUE":
                case "yes": case "Yes": case "YES":
                case "on": case "On": case "ON":
                    return true;
                case "false": case "False": case "FALSE":
                case "no": case "No": case "NO":
                case "off": case "Off": case "OFF":
                    return false;
            }

            // Integers (no leading zeros - those stay strings, e.g. car number 07)
            if (IntRegex.IsMatch(s) && long.TryParse(s, out var l)) return l;

            // Floats
            if ((s.Contains('.') || s.Contains('e') || s.Contains('E')) && FloatRegex.IsMatch(s) &&
                double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d))
                return d;

            return s;
        }
    }

    // ============================================================
    //  Reflection-free JSON serialization (trim-safe).
    // ============================================================
    static class JsonUtil
    {
        public static string Serialize(object? value)
        {
            using var stream = new MemoryStream();
            using (var writer = new Utf8JsonWriter(stream))
            {
                WriteValue(writer, value);
            }
            return Encoding.UTF8.GetString(stream.ToArray());
        }

        private static void WriteValue(Utf8JsonWriter w, object? v)
        {
            switch (v)
            {
                case null:
                    w.WriteNullValue(); break;
                case string s:
                    w.WriteStringValue(s); break;
                case bool b:
                    w.WriteBooleanValue(b); break;
                case long l:
                    w.WriteNumberValue(l); break;
                case int i:
                    w.WriteNumberValue(i); break;
                case double d:
                    if (double.IsFinite(d)) w.WriteNumberValue(d); else w.WriteNullValue();
                    break;
                case float f:
                    if (float.IsFinite(f)) w.WriteNumberValue(f); else w.WriteNullValue();
                    break;
                case Dictionary<string, object?> map:
                    w.WriteStartObject();
                    foreach (var kv in map)
                    {
                        w.WritePropertyName(kv.Key);
                        WriteValue(w, kv.Value);
                    }
                    w.WriteEndObject();
                    break;
                case List<object?> list:
                    w.WriteStartArray();
                    foreach (var item in list) WriteValue(w, item);
                    w.WriteEndArray();
                    break;
                default:
                    w.WriteStringValue(v.ToString());
                    break;
            }
        }
    }
}
