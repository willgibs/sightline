import importlib.util, io, contextlib, math
spec=importlib.util.spec_from_file_location('b',__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'ballistics.py'))
with contextlib.redirect_stdout(io.StringIO()):
    b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
mv=2700*0.3048; k=0.000756; g=b.GRAV
def closed_bore_frame(theta,t):
    s=k*mv; u=math.log(1+s*t)/k; w=-g*math.cos(theta)*(t*t/4+0.5*(t/s-math.log(1+s*t)/(s*s)))
    # convert bore-frame (u along bore, w perpendicular 'down-ish' in the vertical plane) to world x,y
    x=u*math.cos(theta)-w*math.sin(theta)*-1*-1  # w measured along the perpendicular (rotated up-normal)
    # perpendicular unit (up-normal) = (-sin, cos); w is along it
    x=u*math.cos(theta)+w*(-math.sin(theta)); y=u*math.sin(theta)+w*math.cos(theta)
    return x,y
def numeric(theta,T,dt=1e-4):
    p=(0.0,0.0,0.0); v=(mv*math.cos(theta),mv*math.sin(theta),0.0); t=0.0
    while t<T-1e-12:
        h=min(dt,T-t); p,v=b.step('rk4',p,v,h,(0,0,0),0.263,'const',k); t+=h
    return p
for deg in [0,10,20,30,-30]:
    th=math.radians(deg)
    for T in [0.41,0.74]:
        x,y=closed_bore_frame(th,T); p=numeric(th,T)
        print("angle %+3d deg t=%.2f s: closed (bore frame) vs numeric: dx %+.1f cm dy %+.1f cm (range along bore %.0f m)"%(deg,T,(x-p[0])*100,(y-p[1])*100,math.hypot(p[0],p[1])))
print("--- with along-bore gravity term -0.5 g sin(theta) t^2, errors split along/perpendicular to the bore ---")
for deg in [10,20,30,-30]:
    th=math.radians(deg)
    for T in [0.41,0.74]:
        s=k*mv; u=math.log(1+s*T)/k-0.5*g*math.sin(th)*T*T; w=-g*math.cos(th)*(T*T/4+0.5*(T/s-math.log(1+s*T)/(s*s)))
        x=u*math.cos(th)-w*math.sin(th); y=u*math.sin(th)+w*math.cos(th); p=numeric(th,T)
        ex,ey=x-p[0],y-p[1]; along=ex*math.cos(th)+ey*math.sin(th); perp=-ex*math.sin(th)+ey*math.cos(th)
        print("angle %+3d t=%.2f: along-bore err %+.1f cm, perpendicular (aim) err %+.2f cm"%(deg,T,along*100,perp*100))
