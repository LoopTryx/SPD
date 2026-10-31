using System;
using System.Drawing;
using System.Drawing.Imaging;

internal static class VisualButtonTests
{
    public static int Main()
    {
        using(var image=new Bitmap(320,120,PixelFormat.Format24bppRgb))
        using(var graphics=Graphics.FromImage(image)) {
            graphics.Clear(Color.FromArgb(25,25,25));
            graphics.FillRectangle(Brushes.Black,50,40,200,24);
            using(var face=new SolidBrush(Color.FromArgb(120,120,120)))graphics.FillRectangle(face,51,41,198,22);
            var found=VisualButtons.Detect(image,1);
            if(!found.Exists(r=>Math.Abs(r.X-50)<4 && Math.Abs(r.Y-40)<4 && Math.Abs(r.Width-200)<6))return Fail("missed rectangular button");
            graphics.Clear(Color.FromArgb(120,120,120));
            if(VisualButtons.Detect(image,1).Count!=0)return Fail("flat surface became a button");
            graphics.Clear(Color.Black);graphics.FillRectangle(Brushes.Red,50,40,200,24);
            if(VisualButtons.Detect(image,1).Count!=0)return Fail("colored surface became a gray menu button");
            graphics.Clear(Color.Black);graphics.FillRectangle(Brushes.Gray,50,40,40,40);
            if(VisualButtons.Detect(image,1).Count!=0)return Fail("square inventory slot became a button");
        }
        Console.WriteLine("Visual detector: 4 positive/negative fixture checks passed.");return 0;
    }
    private static int Fail(string message){Console.Error.WriteLine(message);return 1;}
}
