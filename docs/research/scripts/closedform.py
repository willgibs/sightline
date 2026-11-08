import math, importlib.util, sys
spec=importlib.util.spec_from_file_location('b',__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'ballistics.py'))
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
mv=2700*0.3048; bc=0.263; k=0.000756; g=b.GRAV; h=0.04
# closed form flat fire with constant k: x(t)=ln(1+s t)/k, s=k v0 ; y(t)=-g[t^2/4 + (t/s - ln(1+s t)/s^2)/2]
def t_at(x): return (math.exp(k*x)-1)/(k*mv)
def drop_t(t):
    s=k*mv; return -g*(t*t/4 + 0.5*(t/s - math.log(1+s*t)/(s*s)))
# zero at 100 m: angle so that -h + tan(a)*100 + drop(t100) = 0
a=math.atan((h - drop_t(t_at(100)))/100)
aa=b.zero(mv,bc,model='const',kc=k); oc=b.fly(mv,bc,aa,b.R,model='const',kc=k)
ref=b.fly(mv,bc,b.zero(mv,bc),b.R)
print("closed-form const-k vs numeric const-k vs G7 reference (drop cm, TOF s)")
for r in b.R:
    t=t_at(r); y=-h+math.tan(a)*r+drop_t(t)
    print("  %4d m: closed %.3f s %7.1f cm | numeric %.3f s %7.1f cm | G7 %.3f s %7.1f cm"%(r,t,y*100,oc[r]['t'],oc[r]['y']*100,ref[r]['t'],ref[r]['y']*100))
ow=b.fly(mv,bc,aa,[300,500],model='const',kc=k,wind=(0,0,10/3.6))
print("const-k wind drift 10 km/h: 300 m %.1f cm, 500 m %.1f cm"%(ow[300]['z']*100,ow[500]['z']*100))
print("per-tick travel at 30 Hz: %.1f m at muzzle; sagitta of one 30 Hz segment from gravity: %.2f mm"%(mv/30, g*(1/30)**2/8*1000))
# walking target displacement during one tick and render-interp lag
for v in [1.4,3.0,5.0]:
    print("target %.1f m/s moves %.1f cm per 30 Hz tick"%(v, v/30*100))
