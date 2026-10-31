using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class TestForm : Form
{
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams { get { var value=base.CreateParams;value.ExStyle|=0x08000000;return value; } }
}
internal static class WindowFixture
{
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [STAThread]
    public static void Main()
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        Application.EnableVisualStyles();
        var area=Screen.PrimaryScreen.WorkingArea;
        using(var form=new TestForm()) {
            form.Text="SPD target verification";form.ShowInTaskbar=false;form.TopMost=true;
            form.StartPosition=FormStartPosition.Manual;form.SetBounds(area.Left+area.Width/2-170,area.Top+area.Height/2-90,340,180);
            var button=new Button();button.Text="Read-only target check";button.SetBounds(60,50,200,40);form.Controls.Add(button);
            form.Shown+=delegate {
                // The test executable starts with windowsHide to suppress its
                // console. Override that first-show flag for this one fixture.
                ShowWindow(form.Handle,4);
                SetWindowPos(form.Handle,new IntPtr(-1),0,0,0,0,0x1|0x2|0x10|0x40);
                var ready=new System.Windows.Forms.Timer();ready.Interval=700;ready.Tick+=delegate {
                ready.Stop();ready.Dispose();
                form.SetBounds(area.Left+area.Width/2-170,area.Top+area.Height/2-90,340,180);
                form.Activate();form.BringToFront();
                SetWindowPos(form.Handle,new IntPtr(-1),0,0,0,0,0x1|0x2|0x40);
                var bounds=button.RectangleToScreen(button.ClientRectangle);
                Console.WriteLine(new JavaScriptSerializer().Serialize(new {x=bounds.X,y=bounds.Y,width=bounds.Width,height=bounds.Height,visible=IsWindowVisible(form.Handle),pid=System.Diagnostics.Process.GetCurrentProcess().Id,hwnd=form.Handle.ToInt64()}));
                new Thread(delegate(){Console.ReadLine();try{form.BeginInvoke(new Action(form.Close));}catch{}}){IsBackground=true}.Start();
                };ready.Start();
            };
            var timer=new System.Windows.Forms.Timer();timer.Interval=8000;timer.Tick+=delegate{form.Close();};timer.Start();
            Application.Run(form);timer.Dispose();
        }
    }
}
