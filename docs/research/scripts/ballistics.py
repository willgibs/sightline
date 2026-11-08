# Point-mass G7 solver for research notes. ICAO standard atmosphere, flat fire, no Coriolis/spin.
import math
G7 = [(0.00,0.1198),(0.05,0.1197),(0.10,0.1196),(0.15,0.1194),(0.20,0.1193),(0.25,0.1194),(0.30,0.1194),(0.35,0.1194),(0.40,0.1193),(0.45,0.1193),(0.50,0.1194),(0.55,0.1193),(0.60,0.1194),(0.65,0.1197),(0.70,0.1202),(0.725,0.1207),(0.75,0.1215),(0.775,0.1226),(0.80,0.1242),(0.825,0.1266),(0.85,0.1306),(0.875,0.1368),(0.90,0.1464),(0.925,0.1660),(0.95,0.2054),(0.975,0.2993),(1.0,0.3803),(1.025,0.4015),(1.05,0.4043),(1.075,0.4034),(1.10,0.4014),(1.125,0.3987),(1.15,0.3955),(1.20,0.3884),(1.25,0.3810),(1.30,0.3732),(1.35,0.3657),(1.40,0.3580),(1.50,0.3440),(1.55,0.3376),(1.60,0.3315),(1.65,0.3260),(1.70,0.3209),(1.75,0.3160),(1.80,0.3117),(1.85,0.3078),(1.90,0.3042),(1.95,0.3010),(2.00,0.2980),(2.05,0.2951),(2.10,0.2922),(2.15,0.2892),(2.20,0.2864),(2.25,0.2835),(2.30,0.2807),(2.35,0.2779),(2.40,0.2752),(2.45,0.2725),(2.50,0.2697),(2.55,0.2670),(2.60,0.2643),(2.65,0.2615),(2.70,0.2588),(2.75,0.2561),(2.80,0.2533),(2.85,0.2506),(2.90,0.2479),(2.95,0.2451),(3.00,0.2424),(3.10,0.2368),(3.20,0.2313),(3.30,0.2258),(3.40,0.2205),(3.50,0.2154),(3.60,0.2106),(3.70,0.2060),(3.80,0.2017),(3.90,0.1975),(4.00,0.1935),(4.20,0.1861),(4.40,0.1793),(4.60,0.1730),(4.80,0.1672),(5.00,0.1618)]
RHO=1.225; C=340.29; GRAV=9.80665; K=math.pi/(8*703.0696)  # BC lb/in^2 -> m^2/kg factor
def cd(m):
    if m<=G7[0][0]: return G7[0][1]
    for i in range(1,len(G7)):
        if m<=G7[i][0]:
            (m0,c0),(m1,c1)=G7[i-1],G7[i]; return c0+(c1-c0)*(m-m0)/(m1-m0)
    return G7[-1][1]
def acc(v,wind,bc,model='g7',kconst=None):
    ax,ay,az=v[0]-wind[0],v[1]-wind[1],v[2]-wind[2]
    s=math.sqrt(ax*ax+ay*ay+az*az)
    if model=='g7': k=RHO*cd(s/C)*K/bc
    elif model=='const': k=kconst
    else: k=0.0
    return (-k*s*ax,-k*s*ay-GRAV,-k*s*az)
def step(method,p,v,dt,wind,bc,model,kc):
    f=lambda vv: acc(vv,wind,bc,model,kc)
    if method=='euler':
        a=f(v); return tuple(p[i]+v[i]*dt for i in range(3)), tuple(v[i]+a[i]*dt for i in range(3))
    if method=='semi':
        a=f(v); nv=tuple(v[i]+a[i]*dt for i in range(3)); return tuple(p[i]+nv[i]*dt for i in range(3)), nv
    if method=='semi_g':  # semi-implicit drag, exact constant gravity in position (p += v dt + 0.5 g dt^2 style)
        a=f(v); nv=tuple(v[i]+a[i]*dt for i in range(3)); g=(0,-GRAV,0)
        return tuple(p[i]+0.5*(v[i]+nv[i])*dt for i in range(3)), nv
    if method=='rk2':
        a1=f(v); v1=tuple(v[i]+a1[i]*dt for i in range(3)); a2=f(v1)
        nv=tuple(v[i]+0.5*(a1[i]+a2[i])*dt for i in range(3)); return tuple(p[i]+0.5*(v[i]+v1[i])*dt for i in range(3)), nv
    if method=='rk4':
        k1v=f(v); k1p=v
        v2=tuple(v[i]+0.5*dt*k1v[i] for i in range(3)); k2v=f(v2); k2p=v2
        v3=tuple(v[i]+0.5*dt*k2v[i] for i in range(3)); k3v=f(v3); k3p=v3
        v4=tuple(v[i]+dt*k3v[i] for i in range(3)); k4v=f(v4); k4p=v4
        nv=tuple(v[i]+dt/6*(k1v[i]+2*k2v[i]+2*k3v[i]+k4v[i]) for i in range(3))
        np_=tuple(p[i]+dt/6*(k1p[i]+2*k2p[i]+2*k3p[i]+k4p[i]) for i in range(3)); return np_,nv
def fly(mv,bc,angle,ranges,dt=1e-4,method='rk4',wind=(0,0,0),h=0.04,model='g7',kc=None):
    # bore starts at y=-h below line of sight (LOS is y=0, horizontal)
    p=(0.0,-h,0.0); v=(mv*math.cos(angle),mv*math.sin(angle),0.0); t=0.0; out={}; ri=0
    while ri<len(ranges):
        np_,nv=step(method,p,v,dt,wind,bc,model,kc)
        while ri<len(ranges) and np_[0]>=ranges[ri]:
            f=(ranges[ri]-p[0])/(np_[0]-p[0])
            out[ranges[ri]]=dict(t=t+f*dt,y=p[1]+f*(np_[1]-p[1]),z=p[2]+f*(np_[2]-p[2]),v=math.sqrt(sum((v[i]+f*(nv[i]-v[i]))**2 for i in range(3))))
            ri+=1
        p,v,t=np_,nv,t+dt
        if t>10: break
    return out
def zero(mv,bc,zr=100.0,**kw):
    lo,hi=-0.01,0.02
    for _ in range(60):
        mid=(lo+hi)/2; y=fly(mv,bc,mid,[zr],**kw)[zr]['y']
        if y>0: hi=mid
        else: lo=mid
    return (lo+hi)/2
loads=[('.308 Win 168gr ELD-M (Hornady 2700 fps, G7 .263)',2700*0.3048,0.263),
       ('6.5 CM 140gr ELD-M (Hornady 2710 fps, G7 .326)',2710*0.3048,0.326),
       ('.300 WM 195gr ELD-M (Hornady 2930 fps, G7 .292)',2930*0.3048,0.292)]
R=[100,200,300,400,500,600,800]
wind=(0,0,10/3.6)
print("== Reference trajectories, 100 m zero, sight height 4 cm, ICAO atmosphere, RK4 dt=1e-4 ==")
for name,mv,bc in loads:
    a=zero(mv,bc); o=fly(mv,bc,a,R); ow=fly(mv,bc,a,R,wind=wind)
    print(name, "MV %.0f m/s"%mv)
    for r in R:
        d=o[r]; dw=ow[r]
        lag=10/3.6*(d['t']-r/mv)
        print("  %4d m: TOF %.3f s  v %.0f m/s (M%.2f)  drop %6.1f cm = %5.2f mil   10km/h xwind %5.1f cm = %4.2f mil (lag rule %5.1f cm)"%(r,d['t'],d['v'],d['v']/C,d['y']*100,-d['y']/r*1000,dw['z']*100,dw['z']/r*1000,lag*100))
# Tarkov post check: 175 SMK 880 m/s G7 .252
a=zero(880,0.252); o=fly(880,0.252,a,[400])
print("Check vs Tarkov post real-world column (880 m/s, G7 .252): 400 m TOF %.3f s v %.0f m/s drop(100m zero) %.1f cm"%(o[400]['t'],o[400]['v'],o[400]['y']*100))
# Integrator study: .308 load, 500 m, compare to reference
name,mv,bc=loads[0]; a=zero(mv,bc); ref=fly(mv,bc,a,[300,500])
print("\n== Integrator error vs reference (.308 168gr, same launch angle), vertical error at 300/500 m in cm, TOF error ms ==")
for method in ['euler','semi','semi_g','rk2','rk4']:
    for hz in [30,60,120,240,480,960]:
        o=fly(mv,bc,a,[300,500],dt=1.0/hz,method=method)
        e3=(o[300]['y']-ref[300]['y'])*100; e5=(o[500]['y']-ref[500]['y'])*100; te=(o[500]['t']-ref[500]['t'])*1000
        print("  %-7s %4d Hz: err300 %+7.2f cm  err500 %+7.2f cm  TOFerr500 %+6.2f ms"%(method,hz,e3,e5,te))
# Simplified models fitted to the .308 load
print("\n== Simplified models vs G7 reference (.308 168gr), each with its own 100 m zero ==")
ref_all=fly(mv,bc,a,R)
# constant-k quadratic drag fitted so TOF at 500 m matches
lo,hi=0.0,0.01
for _ in range(60):
    mid=(lo+hi)/2; aa=zero(mv,bc,model='const',kc=mid); t=fly(mv,bc,aa,[500],model='const',kc=mid)[500]['t']
    if t<ref_all[500]['t']: lo=mid
    else: hi=mid
kfit=(lo+hi)/2; aa=zero(mv,bc,model='const',kc=kfit); oc=fly(mv,bc,aa,R,model='const',kc=kfit)
print("  const-k quadratic drag k=%.6f 1/m (Arma-style a=-k|v|v)"%kfit)
for r in R: print("    %4d m: TOF %.3f vs %.3f  drop %6.1f vs %6.1f cm"%(r,oc[r]['t'],ref_all[r]['t'],oc[r]['y']*100,ref_all[r]['y']*100))
ag=zero(mv,bc,model='none'); og=fly(mv,bc,ag,R,model='none')
print("  gravity-only (no drag), same MV")
for r in R: print("    %4d m: TOF %.3f vs %.3f  drop %6.1f vs %6.1f cm"%(r,og[r]['t'],ref_all[r]['t'],og[r]['y']*100,ref_all[r]['y']*100))
# crack-thump at target / along line, and lead for walking target
print("\n== Crack-thump gap at the target position and lead for a 1.4 m/s walker (.308 168gr) ==")
for r in [100,200,300,400,500,600,800]:
    t=ref_all[r]['t']; print("  %4d m: bullet %.3f s, report %.3f s, gap %.3f s; lead 1.4 m/s: %.2f m = %.2f mil"%(r,t,r/343.0,r/343.0-t,1.4*t,1.4*t/r*1000))
# subsonic illustration: 320 m/s, assumed G7 0.30 (illustrative only)
a=zero(320,0.30); o=fly(320,0.30,a,[100,150,200,300])
print("\n== Illustrative subsonic .308 (320 m/s, ASSUMED G7 0.30) 100 m zero ==")
for r in [100,150,200,300]: print("  %d m: TOF %.3f s drop %.1f cm = %.2f mil"%(r,o[r]['t'],o[r]['y']*100,-o[r]['y']/r*1000))
