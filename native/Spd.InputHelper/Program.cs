using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace Spd.InputHelper;

internal static class Program
{
    public static int Main(string[] args)
    {
        bool dryRun = args.Contains("--dry-run");
        int failAfter = -1;
        foreach (string arg in args)
        {
            if (arg == "--dry-run") continue;
            if (dryRun && arg.StartsWith("--fail-after=") &&
                int.TryParse(arg["--fail-after=".Length..], out int count) && count >= 0) failAfter = count;
            else return 2; // Fault simulation is never accepted in live mode.
        }
        using var output = new ProtocolOutput();
        var engine = new Engine(output, dryRun, failAfter);
        output.Broken = engine.OutputFailed;
        AppDomain.CurrentDomain.ProcessExit += (_, _) => engine.ReleaseOnExit();
        output.Emit(new { type = "ready", protocol = 1, dryRun, inputSize = Marshal.SizeOf<NativeInput.Input>() });
        engine.StartWatchdog();
        try
        {
            // Bounded framing also rejects an oversized line that never receives a newline.
            var line = new StringBuilder();
            while (!engine.Stopped)
            {
                int next = Console.In.Read();
                if (next < 0) { engine.Shutdown("eof"); break; }
                if (next == '\n')
                {
                    engine.Process(line.ToString());
                    line.Clear();
                }
                else if (next != '\r')
                {
                    if (line.Length >= 4096) { engine.Shutdown("frame-too-large", true); break; }
                    line.Append((char)next);
                }
            }
        }
        catch { engine.Shutdown("fault", true); }
        finally { engine.Shutdown("exit"); }
        return engine.Faulted ? 1 : 0;
    }
}

internal sealed class ProtocolOutput : IDisposable
{
    private readonly BlockingCollection<string> lines = new(256);
    private readonly Thread writer;
    public Action? Broken { get; set; }
    public ProtocolOutput()
    {
        writer = new Thread(() =>
        {
            try { foreach (string line in lines.GetConsumingEnumerable()) Console.Out.WriteLine(line); }
            catch { Broken?.Invoke(); }
        }) { IsBackground = true, Name = "SPD protocol output" };
        writer.Start();
    }
    public void Emit(object value)
    {
        // Never let a stalled parent stdout block the watchdog or input release.
        if (!lines.TryAdd(JsonSerializer.Serialize(value))) throw new IOException("Output queue full");
    }
    public void Dispose() { lines.CompleteAdding(); writer.Join(500); }
}

internal sealed class Engine
{
    // Leave room for the Windows scheduler to wake the watchdog before the lease expires.
    private const long WatchdogLeadMilliseconds = 35;
    private readonly object gate = new();
    private readonly ProtocolOutput output;
    private readonly InputSink input;
    private string? session;
    private long seq;
    private long expiresAt;
    private long capturedAt = -1;
    private long monotonicDeadline;
    private bool leased;
    private volatile bool stopped;
    public bool Stopped => stopped;
    public bool Faulted { get; private set; }
    private static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public Engine(ProtocolOutput output, bool dryRun, int failAfter)
    {
        this.output = output;
        input = new InputSink(output, dryRun, failAfter);
    }
    public void StartWatchdog()
    {
        new Thread(() =>
        {
            while (!stopped)
            {
                lock (gate)
                {
                    if (leased && (Now >= expiresAt - WatchdogLeadMilliseconds ||
                        Stopwatch.GetTimestamp() >= monotonicDeadline -
                        (long)(WatchdogLeadMilliseconds * (double)Stopwatch.Frequency / 1000)))
                    {
                        try { Release("expired"); }
                        catch { Faulted = true; stopped = true; }
                    }
                }
                Thread.Sleep(1);
            }
        }) { IsBackground = true, Name = "SPD independent lease watchdog", Priority = ThreadPriority.AboveNormal }.Start();
    }
    public void Process(string line)
    {
        lock (gate)
        {
            if (stopped) return;
            string? commandSession = null;
            long commandSeq = 0;
            try
            {
                using var document = JsonDocument.Parse(line, new JsonDocumentOptions { MaxDepth = 4 });
                JsonElement c = document.RootElement;
                string type = c.GetProperty("type").GetString() ?? throw new FormatException();
                commandSession = c.GetProperty("session").GetString();
                commandSeq = c.GetProperty("seq").GetInt64();
                long commandExpiry = c.GetProperty("expiresAt").GetInt64();
                if (string.IsNullOrWhiteSpace(commandSession) || commandSession.Length > 128 ||
                    commandSeq != seq + 1 || (session != null && session != commandSession))
                    throw new FormatException("Session or sequence mismatch");
                if (session == null && type != "lease" && type != "stop" && type != "release")
                    throw new FormatException("First input requires a lease");
                session ??= commandSession;
                seq = commandSeq;

                if (type == "stop" || type == "release")
                {
                    // Safety release commands remain valid even if their transport deadline elapsed.
                    Release(type);
                    output.Emit(new { type = "ack", session, seq, ok = true });
                    if (type == "stop") stopped = true;
                    return;
                }
                long now = Now;
                if (type == "lease")
                {
                    long capture = c.GetProperty("capturedAt").GetInt64();
                    if (capture < 0 || capture > now || capture <= capturedAt ||
                        capture > long.MaxValue - 250 || commandExpiry != capture + 250 || commandExpiry <= now)
                        throw new FormatException("Invalid capture lease");
                    // An expired old hold may never survive or be replayed by a subsequent capture.
                    if (leased && (now >= expiresAt || Stopwatch.GetTimestamp() >= monotonicDeadline)) Release("expired");
                    capturedAt = capture;
                    expiresAt = commandExpiry;
                    monotonicDeadline = Stopwatch.GetTimestamp() + (long)((expiresAt - now) * (double)Stopwatch.Frequency / 1000);
                    leased = true;
                }
                else
                {
                    if (!leased || now >= expiresAt || Stopwatch.GetTimestamp() >= monotonicDeadline ||
                        commandExpiry <= now || commandExpiry > expiresAt)
                        throw new FormatException("Expired input");
                    switch (type)
                    {
                        case "move":
                            input.Move(c.GetProperty("x").GetInt32(), c.GetProperty("y").GetInt32());
                            break;
                        case "button":
                            string button = c.GetProperty("button").GetString() ?? "";
                            if (button != "left" && button != "right") throw new FormatException("Unknown button");
                            input.Button(button, c.GetProperty("pressed").GetBoolean());
                            break;
                        case "scroll":
                            int delta = c.GetProperty("delta").GetInt32();
                            if (delta == 0 || delta < -1200 || delta > 1200) throw new FormatException("Invalid wheel");
                            input.Scroll(delta);
                            break;
                        case "workspace":
                            string direction = c.GetProperty("direction").GetString() ?? "";
                            if (direction != "next" && direction != "previous") throw new FormatException("Unknown direction");
                            input.Workspace(direction == "next" ? (ushort)39 : (ushort)37);
                            break;
                        default: throw new FormatException("Unknown command");
                    }
                }
                output.Emit(new { type = "ack", session, seq, ok = true });
            }
            catch
            {
                Faulted = true;
                stopped = true;
                try { Release("fault"); } catch { /* Every held input was attempted by ReleaseAll. */ }
                try { output.Emit(new { type = "ack", session = commandSession, seq = commandSeq, ok = false }); } catch { }
            }
        }
    }
    private void Release(string reason)
    {
        leased = false; expiresAt = 0; monotonicDeadline = 0;
        input.ReleaseAll();
        output.Emit(new { type = "released", reason, at = Now });
    }
    public void Shutdown(string reason, bool fault = false)
    {
        lock (gate)
        {
            Faulted |= fault;
            stopped = true;
            try { Release(reason); } catch { Faulted = true; }
        }
    }
    public void ReleaseOnExit() { lock (gate) { try { input.ReleaseAll(); } catch { } } }
    public void OutputFailed()
    {
        Shutdown("output-fault", true);
        // The input reader may be blocked indefinitely. Release first, then terminate.
        Environment.Exit(1);
    }
}

internal sealed class InputSink
{
    private readonly ProtocolOutput output;
    private readonly bool dryRun;
    private readonly HashSet<string> buttons = [];
    private readonly HashSet<ushort> keys = [];
    private int failAfter;
    public InputSink(ProtocolOutput output, bool dryRun, int failAfter)
    {
        this.output = output; this.dryRun = dryRun; this.failAfter = failAfter;
    }
    private void MaybeFail()
    {
        if (!dryRun || failAfter < 0) return;
        if (failAfter-- == 0) { failAfter = -1; throw new IOException("Simulated partial native failure"); }
    }
    public void Move(int x, int y)
    {
        MaybeFail();
        if (dryRun) output.Emit(new { type = "input", kind = "move", x, y });
        else if (!NativeInput.SetCursorPos(x, y)) throw new IOException("SetCursorPos failed");
    }
    public void Button(string button, bool pressed)
    {
        if (buttons.Contains(button) == pressed) return;
        if (pressed) buttons.Add(button); // Track even uncertain native failure so cleanup attempts an up.
        MaybeFail();
        if (dryRun) output.Emit(new { type = "input", kind = "button", button, pressed });
        else NativeInput.SendMouse(button == "left" ? (pressed ? 2u : 4u) : (pressed ? 8u : 16u), 0);
        if (!pressed) buttons.Remove(button);
    }
    public void Scroll(int delta)
    {
        MaybeFail();
        if (dryRun) output.Emit(new { type = "input", kind = "scroll", delta });
        else NativeInput.SendMouse(0x0800, unchecked((uint)delta));
    }
    private void Key(ushort key, bool pressed)
    {
        if (pressed) keys.Add(key);
        MaybeFail();
        if (dryRun) output.Emit(new { type = "input", kind = "key", key, pressed });
        else NativeInput.SendKey(key, pressed);
        if (!pressed) keys.Remove(key);
    }
    public void Workspace(ushort arrow)
    {
        try { Key(17, true); Key(91, true); Key(arrow, true); }
        finally { ReleaseKeys(); }
    }
    private void ReleaseKeys()
    {
        Exception? failure = null;
        foreach (ushort key in keys.Reverse().ToArray())
        {
            try { Key(key, false); } catch (Exception e) { failure = e; }
        }
        if (failure != null) throw failure;
    }
    public void ReleaseAll()
    {
        Exception? failure = null;
        foreach (string button in buttons.ToArray())
        {
            try { Button(button, false); } catch (Exception e) { failure = e; }
        }
        try { ReleaseKeys(); } catch (Exception e) { failure = e; }
        if (failure != null) throw failure;
    }
}

internal static class NativeInput
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MouseInput { public int dx, dy; public uint mouseData, flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)]
    public struct KeyboardInput { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion
    {
        [FieldOffset(0)] public MouseInput mouse;
        [FieldOffset(0)] public KeyboardInput keyboard;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct Input { public uint type; public InputUnion data; }
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, Input[] inputs, int size);
    private static void Send(Input input)
    {
        if (SendInput(1, [input], Marshal.SizeOf<Input>()) != 1) throw new IOException("SendInput rejected");
    }
    public static void SendMouse(uint flags, uint data) =>
        Send(new Input { type = 0, data = new InputUnion { mouse = new MouseInput { flags = flags, mouseData = data } } });
    public static void SendKey(ushort vk, bool pressed) =>
        Send(new Input { type = 1, data = new InputUnion { keyboard = new KeyboardInput { vk = vk, flags = pressed ? 0u : 2u } } });
}
