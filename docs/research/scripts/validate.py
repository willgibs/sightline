import importlib.util, io, contextlib
spec=importlib.util.spec_from_file_location('b',__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'ballistics.py'))
with contextlib.redirect_stdout(io.StringIO()):
    b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
# Wikipedia External ballistics example: Lapua .338, 830 m/s, G7 BC 0.377, ISA sea level; G7 column: 1500 m 339 m/s 2.8404 s drop 30.039 m; 3000 m 235 m/s 8.3369 s 246.968 m
o=b.fly(830,0.377,0.0,[1500,3000],dt=1e-3,h=0.0)
for r in [1500,3000]:
    print("%d m: v %.0f m/s TOF %.4f s drop %.3f m"%(r,o[r]['v'],o[r]['t'],-o[r]['y']))
