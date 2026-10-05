#!/usr/bin/env python3
"""Writes solved arm poses (node scripts/solve-pose.mjs > poses.json) into gestures.js / animator.js.
usage: python3 scripts/apply-poses.py poses.json"""
import json, re, sys
P=json.load(open(sys.argv[1]))
def arm(name):
    r=P[name]; return r['upperArm'], r['lowerArm'], r['hand']
pocketR=arm('pocketR'); pocketL=arm('pocketL'); hipL=arm('phoneHipL')
startR={'upperArmR':pocketR[0],'lowerArmR':pocketR[1],'handR':pocketR[2],'fingersR':[40,0,-10]}
startL={'upperArmL':hipL[0],'lowerArmL':hipL[1],'handL':hipL[2],'fingersL':[-25,0,0]}
fingers={'glasses':[0,0,0],'chin':[10,0,0],'scratch':[20,0,0],'facepalm':[0,0,0],'chestHand':[5,0,0],'point':[0,0,0],'pointUp':[0,0,0],'wave':[0,0,0],'handWaveNo':[0,0,0],'phoneShowL':[30,0,0],'crossR':[0,0,0],'crossL':[0,0,0],'spreadR':[-5,0,0],'spreadL':[-5,0,0],'shrugR':[-5,0,0],'shrugL':[-5,0,0],'excitedR':[0,0,0],'excitedL':[0,0,0],'thinkL':[20,0,0],'phoneLookL':[30,0,0]}
G={'glasses':('glasses',None),'chin':('chin',None),'scratch':('scratch',None),'facepalm':('facepalm',None),'chestHand':('chestHand',None),
   'point':('point',None),'pointUp':('pointUp',None),'wave':('wave',None),'handWaveNo':('handWaveNo',None),'phoneShow':(None,'phoneShowL'),
   'phoneLook':(None,'phoneLookL'),'cross':('crossR','crossL'),'spread':('spreadR','spreadL'),'shrug':('shrugR','shrugL'),'excited':('excitedR','excitedL'),'think':('chin','thinkL')}
osc={'wave':('handR',2,18,0.18),'handWaveNo':('handR',0,22,0.16),'scratch':('handR',2,10,0.12),'excited':('lowerArmR',2,12,0.25)}
def num(x): return str(int(x)) if float(x).is_integer() else str(round(x,1))
def fmt(v): return '[' + ', '.join(num(x) for x in v) + ']'
def keys(start,end,T,oscspec=None,dur=None):
    ks=[[0]+list(start),[T]+list(end)]
    if oscspec and dur:
        axis,amp,per=oscspec; t=T+per; sign=1
        while t<dur-0.01:
            e=list(end); e[axis]=e[axis]+amp*sign; ks.append([round(t,2)]+e); sign=-sign; t+=per
        ks.append([round(dur,2)]+list(end))
    return 'K(' + ', '.join(fmt(k) for k in ks) + ')'
s=open('src/character/gestures.js').read()
for g,(tr,tl) in G.items():
    m=re.search(r"\n  %s: \{(?: *//[^\n]*)?\n(.*?)\n  \},"%re.escape(g), s, re.S); assert m, g
    block=m.group(0)
    dur=float(re.search(r"duration: ([0-9.]+)", block).group(1))
    rm=re.search(r"upperArm[RL]: K\(\[0,[^\]]*\], \[([0-9.]+),", block)
    T=min(float(rm.group(1)) if rm else round(dur*0.7,2), dur)
    lines=[]
    for side,task,start in (('R',tr,startR),('L',tl,startL)):
        if not task: continue
        U,L,H=arm(task); F=fingers[task]
        if side=='L': F=[-F[0],F[1],F[2]]
        o=osc.get(g)
        for bone,end in (('upperArm'+side,U),('lowerArm'+side,L),('hand'+side,H),('fingers'+side,F)):
            spec=(o[1],o[2],o[3]) if (o and o[0]==bone) else None
            lines.append('      %s: %s,'%(bone, keys(start[bone],end,T,spec,dur)))
    newblock=re.sub(r"\n      (upperArm|lowerArm|hand|fingers)[RL]: K\([^\n]*\),", "", block)
    newblock=newblock.replace("    tracks: {\n", "    tracks: {\n"+"\n".join(lines)+"\n",1)
    s=s.replace(block,newblock)
open('src/character/gestures.js','w').write(s)
a=open('src/character/animator.js').read()
a=re.sub(r"const POCKET_R = \{.*?\};","const POCKET_R = { upperArmR: %s, lowerArmR: %s, handR: %s, fingersR: [40, 0, -10] };"%tuple(fmt(v) for v in pocketR),a)
a=re.sub(r"const POCKET_L = \{.*?\};","const POCKET_L = { upperArmL: %s, lowerArmL: %s, handL: %s, fingersL: [-40, 0, -10] };"%tuple(fmt(v) for v in pocketL),a)
a=re.sub(r"    upperArmL: \[[^\]]*\], lowerArmL: \[[^\]]*\], handL: \[[^\]]*\], fingersL: \[-25, 0, 0\], // phone at the hip",
         "    upperArmL: %s, lowerArmL: %s, handL: %s, fingersL: [-25, 0, 0], // phone at the hip"%tuple(fmt(v) for v in hipL),a)
pl=arm('phoneLookL')
a=re.sub(r"    p\.upperArmL = \[[^\]]*\];\n    p\.lowerArmL = \[[^\]]*\];\n    p\.handL = \[[^\]]*\];\n    p\.fingersL = \[-30, 0, 0\];",
         "    p.upperArmL = %s;\n    p.lowerArmL = %s;\n    p.handL = %s;\n    p.fingersL = [-30, 0, 0];"%tuple(fmt(v) for v in pl),a)
open('src/character/animator.js','w').write(a)
print('poses applied')
