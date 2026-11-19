"""One-shot asset prep. Reads BRAND/LOGO NOVAR PNG...png (RGBA, colortype 6, alpha0 pixels are pure black RGB 0,0,0)
so every resize is done on PREMULTIPLIED data to avoid dark fringes. Also traces favicon.svg from a real 32x32 pixel grid."""
import numpy as np
from PIL import Image
SRC='BRAND/LOGO NOVAR PNG...png'
im=np.array(Image.open(SRC).convert('RGBA')).astype(np.float64)
crop=im[479:1519,477:1517]            # square around alpha bbox (y504-1494,x492-1502)
def resize_premul(a,size):
    al=a[...,3:4]/255.0
    pm=np.concatenate([a[...,:3]*al,a[...,3:4]],axis=2)
    ch=[np.array(Image.fromarray(pm[...,i].astype(np.float32),mode='F').resize((size,size),Image.LANCZOS)) for i in range(4)]
    pm=np.stack(ch,axis=2); al=np.clip(pm[...,3:4],0,255)/255.0
    rgb=np.where(al>1e-4,pm[...,:3]/np.maximum(al,1e-4),0)
    return np.clip(np.concatenate([rgb,al*255],axis=2),0,255).round().astype(np.uint8)
for n,s in (('logo-512',512),('logo-128',128)):
    Image.fromarray(resize_premul(crop,s),'RGBA').save(f'src/assets/{n}.png',optimize=True)
# apple touch: composite on the asset's own opaque background colour
bg=np.array(Image.open('BRAND/LOGO NOVAR PNG.png').convert('RGB'))[5,5]
t=resize_premul(crop,140).astype(np.float64); al=t[...,3:4]/255
c=np.full((180,180,3),bg,dtype=np.float64); c[20:160,20:160]=t[...,:3]*al+bg*(1-al)
Image.fromarray(c.round().astype(np.uint8)).save('src/assets/apple-touch.png',optimize=True)
# favicon: real 32x32 grid, premultiplied, colours quantised to 8 levels/channel, row-run merged
g=resize_premul(crop,32)
rects=[]
for y in range(32):
    x=0
    while x<32:
        r,gc,b,a=[int(v) for v in g[y,x]]
        if a<26: x+=1; continue
        q=lambda v:min(255,(v+8)//16*16)
        col=(q(r),q(gc),q(b)); op=round(a/255*4)/4; x0=x
        while x<32:
            r2,g2,b2,a2=[int(v) for v in g[y,x]]
            if a2<26 or (q(r2),q(g2),q(b2))!=col or round(a2/255*4)/4!=op: break
            x+=1
        rects.append((x0,y,x-x0,col,op))
out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges">']
for x,y,w,col,op in rects:
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="1" fill="#%02x%02x%02x"'%col+(f' fill-opacity="{op}"' if op<1 else '')+'/>')
out.append('</svg>')
open('src/assets/favicon.svg','w').write('\n'.join(out))
print('rects',len(rects))
# palette report
t=np.array(Image.open(SRC)); 
def px(x,y):
    X,Y=int(x*1.04),int(y*1.04); r=t[Y-3:Y+4,X-3:X+4].reshape(-1,4).mean(0); return '#%02x%02x%02x'%tuple(int(v) for v in r[:3])
for k,(x,y) in {'top':(965,525),'tl':(660,700),'tr':(1260,700),'mid':(965,860),'bl':(540,1060),'br':(1400,1060),'bot':(965,1390)}.items(): print(k,px(x,y))
