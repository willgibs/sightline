import importlib.util, io, contextlib
spec=importlib.util.spec_from_file_location('b',__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'ballistics.py'))
with contextlib.redirect_stdout(io.StringIO()):
    b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
mv=2700*0.3048; bc=0.263
print(".308 168gr: point of impact vs aim (cm) at midpoints when the zero is set in 100 m steps")
for z in [100,200,300,400,500]:
    a=b.zero(mv,bc,zr=float(z)); rs=[z-50,z,z+50] if z>100 else [50,100,150]
    o=b.fly(mv,bc,a,rs)
    print("  zero %d m: "%z + "  ".join("%d m %+6.1f cm"%(r,o[r]['y']*100) for r in rs))
a=b.zero(mv,bc); o=b.fly(mv,bc,a,[275,300,325])
print("range-error sensitivity, 100 m zero: drop 275 %.1f, 300 %.1f, 325 %.1f cm"%(o[275]['y']*100,o[300]['y']*100,o[325]['y']*100))
print("angular size at 300 m: 0.20 m head = %.2f mil; 0.40 m torso = %.2f mil"%(0.2/300*1000,0.4/300*1000))
