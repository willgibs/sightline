import importlib.util, io, contextlib, math
spec=importlib.util.spec_from_file_location('b',__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'ballistics.py'))
with contextlib.redirect_stdout(io.StringIO()):
    b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
mv=2700*0.3048; bc=0.263; a=b.zero(mv,bc)
base=b.fly(mv,bc,a,[300,500])
for f in [0.9965,1.0035]:
    o=b.fly(mv*f,bc,a,[300,500])
    print("MV x%.4f: dy300 %+.2f cm dy500 %+.2f cm"%(f,(o[300]['y']-base[300]['y'])*100,(o[500]['y']-base[500]['y'])*100))
for r in [300,500]:
    v=base[r]['v']; th=math.degrees(math.asin(343.0/v)); print("at %d m v=%.0f m/s: Mach angle %.1f deg; crack appears to come from %.2f d upstream of closest approach"%(r,v,th,math.tan(math.radians(th))))
# naive wind (bullet carried by wind) vs drag-coupled drift at 300/500
for r in [300,500]:
    t=base[r]['t']; print("naive W*TOF at %d m: %.2f m vs real lag-rule drift %.2f m"%(r,2.7778*t,2.7778*(t-r/mv)))
# running target lead in mils
for vt in [1.4,2.5,4.5]:
    print("target %.1f m/s lead at 300 m: %.2f mil, at 500 m: %.2f mil"%(vt,vt*base[300]['t']/300*1000,vt*base[500]['t']/500*1000))
# spin drift via ACE/Litz constants, Sg=1.5 assumed
for r in [300,500]:
    t=base[r]['t']; sd=0.03175*(1.5+1.2)*t**1.83; print("spin drift %d m: %.1f cm (%.2f mil)"%(r,sd*100,sd/r*1000))
