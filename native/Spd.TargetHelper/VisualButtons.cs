using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// Conservative rectangle detector for neutral Minecraft-style menu buttons.
// No OCR, model download, screenshot storage or network calls.
internal static class VisualButtons
{
    private struct Edge { public int Y,L,R; public Edge(int y,int l,int r){Y=y;L=l;R=r;} }
    public static List<Rectangle> Detect(Bitmap bitmap,double scale)
    {
        int w=bitmap.Width,h=bitmap.Height;
        BitmapData locked=bitmap.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);
        byte[] pixels=new byte[locked.Stride*h];int stride=locked.Stride;
        try { Marshal.Copy(locked.Scan0,pixels,0,pixels.Length); }
        finally { bitmap.UnlockBits(locked); }
        byte[] gray=new byte[w*h];
        for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
            int p=y*stride+x*3;gray[y*w+x]=(byte)((pixels[p]+pixels[p+1]+pixels[p+2])/3);
        }
        int minWidth=(int)(60*scale),minHeight=(int)(14*scale),maxHeight=(int)(64*scale),tolerance=Math.Max(2,(int)(3*scale));
        var edges=new List<Edge>();
        for(int y=1;y<h-1 && edges.Count<384;y++) {
            int start=-1,last=-1;
            for(int x=1;x<w;x++) {
                bool edge=x<w-1 && Math.Abs(gray[y*w+x]-gray[(y-1)*w+x])>=22;
                if(edge) { if(start<0)start=x;last=x; }
                if(start>=0 && (!edge && x-last>2 || x==w-1)) {
                    if(last-start>=minWidth)edges.Add(new Edge(y,start,last));start=-1;last=-1;
                }
            }
        }
        var result=new List<Rectangle>();
        for(int i=0;i<edges.Count;i++)for(int j=i+1;j<edges.Count;j++) {
            Edge top=edges[i],bottom=edges[j];int height=bottom.Y-top.Y;
            if(height<minHeight || height>maxHeight || Math.Abs(top.L-bottom.L)>tolerance || Math.Abs(top.R-bottom.R)>tolerance)continue;
            int left=Math.Min(top.L,bottom.L),right=Math.Max(top.R,bottom.R),width=right-left;
            if(width<height*2.3 || width>500*scale)continue;
            bool borders=true;
            foreach(int side in new int[]{left,right}) {
                double best=0;
                for(int offset=-tolerance;offset<=tolerance;offset++) {
                    int x=side+offset;if(x<1 || x>=w)continue;
                    int count=0,total=0;
                    for(int y=top.Y+3;y<bottom.Y-2;y+=2) {total++;if(Math.Abs(gray[y*w+x]-gray[y*w+x-1])>=18)count++;}
                    if(total>0)best=Math.Max(best,(double)count/total);
                }
                if(best<.7)borders=false;
            }
            if(!borders)continue;
            int neutral=0,samples=0,totalGray=0;
            for(int y=top.Y+3;y<bottom.Y-2;y+=4)for(int x=left+3;x<right-2;x+=4) {
                int p=y*stride+x*3;int a=pixels[p],b=pixels[p+1],c=pixels[p+2];samples++;
                if(Math.Max(a,Math.Max(b,c))-Math.Min(a,Math.Min(b,c))<=30)neutral++;
                totalGray+=(a+b+c)/3;
            }
            if(samples==0 || (double)neutral/samples<.85 || totalGray/samples<45 || totalGray/samples>210)continue;
            var rect=new Rectangle(left,top.Y,width,height);
            if(!result.Exists(r=>Math.Abs(r.X-rect.X)<5 && Math.Abs(r.Y-rect.Y)<5 && Math.Abs(r.Width-rect.Width)<8))result.Add(rect);
            if(result.Count>=12)return result;
        }
        return result;
    }

}
