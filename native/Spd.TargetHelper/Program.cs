using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Automation;
using System.Drawing;
using System.Drawing.Imaging;
using System.Text;

// Read-only UIA worker. No mouse, keyboard, InvokePattern or control text access.
internal static class Program
{
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    private delegate bool EnumWindowCallback(IntPtr window,IntPtr parameter);
    [StructLayout(LayoutKind.Sequential)] private struct WindowRect { public int Left,Top,Right,Bottom; }
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowCallback callback,IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window,out WindowRect rect);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window,int index);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window,int attribute,out int value,int size);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr window,StringBuilder value,int size);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
    [StructLayout(LayoutKind.Sequential)] private struct CursorInfo { public int Size,Flags;public IntPtr Cursor;public int X,Y; }
    [DllImport("user32.dll")] private static extern bool GetCursorInfo(ref CursorInfo info);
    private static List<Rectangle> previousVisual=new List<Rectangle>();
    private static long previousVisualAt;

    private static void AddVisualTargets(IntPtr window,int x,int y,int radius,List<object> targets)
    {
        var name=new StringBuilder(128);GetClassName(window,name,name.Capacity);
        string kind=name.ToString().ToLowerInvariant();
        var cursor=new CursorInfo();cursor.Size=Marshal.SizeOf(typeof(CursorInfo));
        if(!(kind.Contains("glfw") || kind.Contains("lwjgl")) || !GetCursorInfo(ref cursor) || (cursor.Flags&1)==0) {
            previousVisual.Clear();return;
        }
        WindowRect windowBox;if(!GetWindowRect(window,out windowBox))return;
        double scale=Math.Max(.75,Math.Min(3,(double)radius/64));
        int screenX=GetSystemMetrics(76),screenY=GetSystemMetrics(77);
        int left=Math.Max(Math.Max(screenX,windowBox.Left),x-(int)(300*scale));
        int top=Math.Max(Math.Max(screenY,windowBox.Top),y-(int)(110*scale));
        int right=Math.Min(Math.Min(screenX+GetSystemMetrics(78),windowBox.Right),x+(int)(300*scale));
        int bottom=Math.Min(Math.Min(screenY+GetSystemMetrics(79),windowBox.Bottom),y+(int)(110*scale));
        if(right-left<80 || bottom-top<30)return;
        var current=new List<Rectangle>();
        using(var image=new Bitmap(right-left,bottom-top,PixelFormat.Format24bppRgb)) {
            using(var graphics=Graphics.FromImage(image))graphics.CopyFromScreen(left,top,0,0,image.Size);
            foreach(var local in VisualButtons.Detect(image,scale))current.Add(new Rectangle(local.X+left,local.Y+top,local.Width,local.Height));
        }
        long now=DateTime.UtcNow.Ticks/TimeSpan.TicksPerMillisecond;
        if(now-previousVisualAt>=80 && now-previousVisualAt<=1000)foreach(var rect in current) {
            double dx=Math.Max(Math.Max(rect.Left-x,0),x-rect.Right),dy=Math.Max(Math.Max(rect.Top-y,0),y-rect.Bottom);
            if(Math.Sqrt(dx*dx+dy*dy)>radius)continue;
            if(previousVisual.Exists(p=>Math.Abs(p.X-rect.X)<=3 && Math.Abs(p.Y-rect.Y)<=3 && Math.Abs(p.Width-rect.Width)<=5 && Math.Abs(p.Height-rect.Height)<=5))
                targets.Add(new {id="visual:"+window.ToInt64()+":"+rect.X+":"+rect.Y+":"+rect.Width+":"+rect.Height,
                    x=rect.X,y=rect.Y,width=rect.Width,height=rect.Height});
        }
        previousVisual=current;previousVisualAt=now;
    }

    private static IntPtr UnderlyingWindow(int x,int y,int excludedProcess,bool diagnostics)
    {
        IntPtr found=IntPtr.Zero;
        EnumWindows(delegate(IntPtr window,IntPtr parameter) {
            if(!IsWindowVisible(window) || IsIconic(window))return true;
            uint owner;GetWindowThreadProcessId(window,out owner);
            if(owner==(uint)excludedProcess)return true;
            long style=GetWindowLongPtr(window,-20).ToInt64();
            // Non-activating windows can contain real buttons (floating tools,
            // popups and our read-only fixture). Only transparent hit-test
            // windows and the explicit SPD process must be skipped.
            if((style & 0x20)!=0)return true;
            WindowRect rect;
            if(!GetWindowRect(window,out rect) || x<rect.Left || x>=rect.Right || y<rect.Top || y>=rect.Bottom)return true;
            if(diagnostics)Console.Error.WriteLine("hit pid="+owner+" hwnd="+window.ToInt64()+" style="+style+" rect="+rect.Left+","+rect.Top+","+rect.Right+","+rect.Bottom);
            int cloaked;
            if(DwmGetWindowAttribute(window,14,out cloaked,4)==0 && cloaked!=0)return true;
            found=window;return false;
        },IntPtr.Zero);
        return found;
    }
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    private static bool Clickable(ControlType type)
    {
        return type == ControlType.Button || type == ControlType.Hyperlink ||
            type == ControlType.CheckBox || type == ControlType.RadioButton || type == ControlType.TabItem ||
            type == ControlType.MenuItem || type == ControlType.ComboBox || type == ControlType.Edit;
    }
    private static void AddTarget(AutomationElement element, int x, int y, int radius, List<object> targets, HashSet<string> seen)
    {
        var info = element.Cached;
        Rect box = info.BoundingRectangle;
        if (!Clickable(info.ControlType) || !info.IsEnabled || info.IsOffscreen || box.IsEmpty ||
            box.Width < 4 || box.Height < 4 || box.Width > 900 || box.Height > 240) return;
        double dx=Math.Max(Math.Max(box.Left-x,0),x-box.Right), dy=Math.Max(Math.Max(box.Top-y,0),y-box.Bottom);
        if (Math.Sqrt(dx*dx+dy*dy)>radius) return;
        string key = info.ProcessId.ToString(CultureInfo.InvariantCulture)+":"+info.ControlType.Id+":"+
            Math.Round(box.X)+":"+Math.Round(box.Y)+":"+Math.Round(box.Width)+":"+Math.Round(box.Height);
        if (seen.Add(key)) targets.Add(new {id=key,x=box.X,y=box.Y,width=box.Width,height=box.Height});
    }
    [MTAThread]
    public static int Main(string[] args)
    {
        bool diagnostics=Array.IndexOf(args,"--diagnostics")>=0;
        int excludedProcess=0;
        foreach(string arg in args)if(arg.StartsWith("--exclude-pid="))int.TryParse(arg.Substring(14),out excludedProcess);
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        Console.WriteLine("{\"type\":\"ready\"}");
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            if (line.Length > 160) return 2;
            string[] pieces = line.Split(' ');
            int id, x, y, radius;
            if (pieces.Length != 4 || !int.TryParse(pieces[0], out id) || id <= 0 ||
                !int.TryParse(pieces[1], out x) || !int.TryParse(pieces[2], out y) ||
                !int.TryParse(pieces[3], out radius) || radius < 1 || radius > 240 ||
                Math.Abs((long)x) > 100000 || Math.Abs((long)y) > 100000) return 2;
            var targets = new List<object>();
            var seen = new HashSet<string>();
            var cache = new CacheRequest();
            cache.Add(AutomationElement.BoundingRectangleProperty);
            cache.Add(AutomationElement.IsEnabledProperty);
            cache.Add(AutomationElement.IsOffscreenProperty);
            cache.Add(AutomationElement.ControlTypeProperty);
            cache.Add(AutomationElement.ProcessIdProperty);
            IntPtr window=IntPtr.Zero;
            try
            {
                AutomationElement root;
                window=UnderlyingWindow(x,y,excludedProcess,diagnostics);
                using (cache.Activate()) root=window==IntPtr.Zero ? null : AutomationElement.FromHandle(window);
                if (root != null)
                {
                    AddTarget(root,x,y,radius,targets,seen);
                    // Point providers often return a whole browser group or a
                    // text leaf. Query its nearest enclosing non-leaf once.
                    for (int depth=0;depth<4 && root!=null &&
                        (Clickable(root.Cached.ControlType) || root.Cached.ControlType==ControlType.Text);depth++)
                    {
                        using (cache.Activate()) root=TreeWalker.ControlViewWalker.GetParent(root);
                    }
                    if (root != null)
                    {
                        ControlType[] types={ControlType.Button,ControlType.Hyperlink,ControlType.CheckBox,ControlType.RadioButton,
                            ControlType.TabItem,ControlType.MenuItem,ControlType.ComboBox,ControlType.Edit};
                        var filters=new Condition[types.Length];
                        for(int i=0;i<types.Length;i++)filters[i]=new PropertyCondition(AutomationElement.ControlTypeProperty,types[i]);
                        Condition condition=new OrCondition(filters);
                        AutomationElementCollection controls;
                        using(cache.Activate())controls=root.FindAll(TreeScope.Descendants,condition);
                        if(diagnostics)Console.Error.WriteLine("candidates="+controls.Count+" root="+root.Cached.ControlType.ProgrammaticName+" pid="+root.Cached.ProcessId+" hwnd="+window.ToInt64());
                        for(int i=0;i<controls.Count && i<512 && targets.Count<12;i++)
                            AddTarget(controls[i],x,y,radius,targets,seen);
                    }
                }
            }
            catch(Exception error) { if(diagnostics)Console.Error.WriteLine(error.GetType().Name); }
            if(targets.Count==0 && window!=IntPtr.Zero) {
                try { AddVisualTargets(window,x,y,radius,targets); }
                catch { previousVisual.Clear(); }
            } else previousVisual.Clear();
            Console.WriteLine(Json.Serialize(new { id=id, targets=targets }));
        }
        return 0;
    }
}
