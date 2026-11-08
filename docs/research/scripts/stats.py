from math import comb, log, sqrt, exp
from statistics import NormalDist

def pmf(n, k, p): return comb(n, k) * p**k * (1-p)**(n-k)
def tail(n, k, p): return sum(pmf(n, i, p) for i in range(k, n+1))

print("P(>=48/60) by p:")
for p in [0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]:
    print(f"  p={p}: {tail(60,48,p):.4g}")

# full rule: total >=48 and each sitting >=21 of 30
def full_rule(p1, p2):
    tot = 0.0
    for a in range(21, 31):
        for b in range(21, 31):
            if a + b >= 48:
                tot += pmf(30, a, p1) * pmf(30, b, p2)
    return tot
print("Full rule (>=48/60, >=21 each sitting):")
for p in [0.70, 0.72, 0.75, 0.78, 0.80, 0.82, 0.85, 0.88, 0.90]:
    print(f"  p={p}: {full_rule(p,p):.3f}")
print("Learning between sittings:")
for p1, p2 in [(0.8,0.8),(0.75,0.85),(0.7,0.9),(0.65,0.95)]:
    print(f"  {p1}->{p2}: {full_rule(p1,p2):.3f}")

# mixture: per sitting 15 clear + 15 borderline; clear acc c, borderline acc b
def dist_sitting(c, b):
    d = [0.0]*31
    for x in range(16):
        for y in range(16):
            d[x+y] += pmf(15, x, c) * pmf(15, y, b)
    return d
def mix_pass(c, b):
    d = dist_sitting(c, b)
    tot = 0.0
    for a in range(21, 31):
        for bb in range(21, 31):
            if a + bb >= 48: tot += d[a]*d[bb]
    return tot
print("Mixture (clear acc, borderline acc) -> P(pass):")
for c, b in [(1.0,0.5),(0.97,0.5),(0.97,0.6),(1.0,0.6),(0.97,0.65),(0.95,0.7)]:
    print(f"  c={c}, b={b}: expected {(c+b)/2:.3f}, P(pass)={mix_pass(c,b):.3f}")
print("Borderline stratum alone, P(>=21/30):")
for b in [0.5, 0.7, 0.75, 0.8]:
    print(f"  b={b}: {tail(30,21,b):.3f}")
print(f"  P(>=20/30 | 0.5) = {tail(30,20,0.5):.3f}")

# Wilson intervals
def wilson(k, n, z=1.959964):
    ph = k/n
    den = 1 + z*z/n
    c = (ph + z*z/(2*n))/den
    h = z*sqrt(ph*(1-ph)/n + z*z/(4*n*n))/den
    return c-h, c+h
for k, n in [(24,30),(48,60),(51,60),(54,60),(12,15)]:
    lo, hi = wilson(k, n)
    print(f"Wilson 95% {k}/{n}: {lo*100:.1f}-{hi*100:.1f}%")
# one-sided 95% Wilson lower bound
for k, n in [(48,60),(54,60)]:
    lo, _ = wilson(k, n, z=1.644854)
    print(f"one-sided 95% Wilson lower {k}/{n}: {lo*100:.1f}%")

# zero-event upper bound
for N in [10,20,40,60,100]:
    print(f"zero marks in N={N}: 95% upper bound {(1-0.05**(1/N))*100:.1f}%")

# spot check 3 of 10
for bad in [1,2,3,5]:
    p_none = comb(10-bad,3)/comb(10,3)
    print(f"owner checks 3 of 10, {bad} bad: P(sees >=1) = {1-p_none:.2f}")

# d'
z = NormalDist().inv_cdf
for a in [0.7,0.8,0.85,0.9]:
    print(f"d' at {a}: {2*z(a):.2f}")
