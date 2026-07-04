from PIL import Image, ImageOps, ImageFilter
import os
os.chdir("/Users/quincy/dev/marshal/docs/images")
BORDER=(212,211,201,255); SHADOW=(60,58,50); MARGIN=26; BLUR=14; OFFSET_Y=6; SHADOW_ALPHA=46
jobs=[("001 副本.png","launcher.png"),("002 副本.png","hero.png"),
      ("003 副本.png","hero-dark.png"),("004 副本.png","settings.png"),
      ("005.png","overview.png")]
for src,dst in jobs:
    im=Image.open(src).convert("RGBA")
    im=ImageOps.expand(im,border=1,fill=BORDER)
    w,h=im.size
    canvas=Image.new("RGBA",(w+MARGIN*2,h+MARGIN*2),(0,0,0,0))
    shadow=Image.new("RGBA",canvas.size,(0,0,0,0))
    sh=Image.new("RGBA",(w,h),SHADOW+(SHADOW_ALPHA,))
    shadow.paste(sh,(MARGIN,MARGIN+OFFSET_Y))
    shadow=shadow.filter(ImageFilter.GaussianBlur(BLUR))
    canvas=Image.alpha_composite(canvas,shadow)
    canvas.paste(im,(MARGIN,MARGIN),im)
    canvas.save(dst)
    print(f"{src} -> {dst}  {canvas.size}")
