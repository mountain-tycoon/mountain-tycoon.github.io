import numpy as np, colorsys, sys, os
from PIL import Image, ImageDraw
OUT=sys.argv[1]   # Aufruf in webgl-3d/public/icons:  python3 ../../tools/make-radio-faces.py .   (legt auch _sheet.png als Übersicht an)
LEVELS=['mittelgebirge','vorland','schweiz','frankreich','alpen','italien','norwegen','rockies','kanada','anden','japan']
BOSS_H=[140,178,208,268,152,288,192,236,166,305,218]
TEAMS={ # boss, rescue, piste, tech  (Name der Vorlage, gespiegelt?)
 'mittelgebirge':[('m_schnauzer',0),('f_lehrerin',0),('mittel',0),('m_brille',0)],
 'vorland':[('f_alt',0),('retter',0),('m_board',0),('sparfuchs',0)],
 'schweiz':[('opa',0),('skilehrer',0),('vater',0),('f_brille',0)],
 'frankreich':[('f_luxus',0),('retter2',0),('teen_m',0),('rentner',0)],
 'alpen':[('premium',0),('f_jung',0),('snowboarder',0),('f_braun',0)],
 'italien':[('f_locken',0),('skilehrer2',0),('premium2',0),('m_board',1)],
 'norwegen':[('f_mittel',0),('retter',1),('f_board',0),('m_brille',1)],
 'rockies':[('premium',1),('f_lehrerin',1),('snowboarder2',0),('rentner',1)],
 'kanada':[('f_normal',0),('skilehrer',1),('snowboarderin',0),('sparfuchs',1)],
 'anden':[('vater',1),('mutter',0),('premium2',1),('opa',1)],
 'japan':[('mittel',1),('f_jung',1),('teen_m',1),('f_brille',1)] }
ROLES=['boss','rescue','piste','tech']
def recolor(im,target):
    a=np.asarray(im.convert('RGBA')).astype(np.float32)/255
    r,g,b=a[...,0],a[...,1],a[...,2]
    mx=a[...,:3].max(-1); mn=a[...,:3].min(-1); d=mx-mn
    s=np.where(mx>0,d/np.maximum(mx,1e-6),0); v=mx
    h=np.zeros_like(mx); m=d>1e-6
    hr=((g-b)/np.maximum(d,1e-6))%6; hg=(b-r)/np.maximum(d,1e-6)+2; hb=(r-g)/np.maximum(d,1e-6)+4
    h=np.where(mx==r,hr,np.where(mx==g,hg,hb))*60; h=np.where(m,h%360,0)
    cloth=((h>150)&(h<335)&(s>0.4)) | (((h>=335)|(h<9))&(s>0.62)&(v>0.25))
    cloth&=a[...,3]>0.2
    if cloth.sum()<200: return im
    ang=np.deg2rad(h[cloth]); w=s[cloth]
    dom=np.rad2deg(np.arctan2((np.sin(ang)*w).sum(),(np.cos(ang)*w).sum()))%360
    delta=(target-dom)
    h2=np.where(cloth,(h+delta)%360,h)
    # zurück nach RGB
    c=v*s; x=c*(1-np.abs((h2/60)%2-1)); m0=v-c
    z=np.zeros_like(c); k=(h2//60).astype(int)%6
    rr=np.choose(k,[c,x,z,z,x,c]); gg=np.choose(k,[x,c,c,x,z,z]); bb=np.choose(k,[z,z,x,c,c,x])
    out=np.stack([rr+m0,gg+m0,bb+m0,a[...,3]],-1)
    return Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8),'RGBA')
made=[]
for li,lv in enumerate(LEVELS):
    bh=BOSS_H[li]; ph=(bh+125)%360
    if ph>335 or ph<25: ph=50
    for ri,role in enumerate(ROLES):
        base,flip=TEAMS[lv][ri]
        im=Image.open(f'guest_{base}.png').convert('RGBA')
        tgt={'boss':bh,'rescue':None,'piste':ph,'tech':48}[role]
        if tgt is not None: im=recolor(im,tgt)
        if flip: im=im.transpose(Image.FLIP_LEFT_RIGHT)
        im.save(f'{OUT}/radio_{lv}_{role}.png'); made.append((lv,role,im))
W=8;sheet=Image.new('RGB',(W*130,((len(made)+W-1)//W)*146),'#223'); d=ImageDraw.Draw(sheet)
for i,(lv,role,im) in enumerate(made):
    x=(i%W)*130;y=(i//W)*146; t=im.resize((128,128)); sheet.paste(t,(x,y),t); d.text((x+2,y+130),lv[:8]+' '+role,fill='white')
sheet.save(OUT+'/_sheet.png')
